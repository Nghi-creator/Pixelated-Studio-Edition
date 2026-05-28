const { exec } = require("child_process");
const {
  buildFallback,
  engineImage,
  engineRuntimeDir,
  pullEngineImage,
} = require("./config");
const { emitEngineState } = require("./state");

function getSafeEnv() {
  if (process.platform === "win32") {
    return process.env;
  }

  return {
    ...process.env,
    PATH: `${process.env.PATH}:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin`,
  };
}

function quoteDockerEnvValue(value) {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\$/g, "\\$")
    .replace(/`/g, "\\`");
}

function isSafeDockerImageRef(value) {
  return /^[a-zA-Z0-9][a-zA-Z0-9._/-]*(?::[a-zA-Z0-9._-]+)?$/.test(value);
}

function streamCommand(event, command, options) {
  return new Promise((resolve, reject) => {
    const child = exec(command, options);

    child.stdout.on("data", (data) =>
      event.reply("server-log", data.toString().trim()),
    );
    child.stderr.on("data", (data) =>
      event.reply("server-log", data.toString().trim()),
    );
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Command failed with exit code ${code}`));
    });
  });
}

function execCommand(command, options) {
  return new Promise((resolve, reject) => {
    exec(command, options, (err, stdout, stderr) => {
      if (err) {
        reject(err);
        return;
      }
      resolve({ stderr, stdout });
    });
  });
}

async function prepareEngineImage(event, safeEnv) {
  if (!isSafeDockerImageRef(engineImage)) {
    throw new Error("Invalid PIXELATED_ENGINE_IMAGE value.");
  }

  if (pullEngineImage) {
    emitEngineState(event, "PULLING_IMAGE", engineImage);
    event.reply("server-log", `Pulling engine image: ${engineImage}`);
    try {
      await streamCommand(event, `docker pull ${engineImage}`, { env: safeEnv });
      return;
    } catch (err) {
      if (!buildFallback) throw err;
      event.reply(
        "server-log",
        "Pull failed. Falling back to local engine image build.",
      );
    }
  }

  emitEngineState(event, "BUILDING_IMAGE", engineRuntimeDir);
  event.reply("server-log", "Building local engine image...");
  await streamCommand(event, `docker build -t ${engineImage} .`, {
    cwd: engineRuntimeDir,
    env: safeEnv,
  });
}

module.exports = {
  exec,
  execCommand,
  getSafeEnv,
  isSafeDockerImageRef,
  prepareEngineImage,
  quoteDockerEnvValue,
};
