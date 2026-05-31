const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const webAppDir = path.resolve(__dirname, "../../web");
const webDistDir = path.join(webAppDir, "dist");
const webIndexPath = path.join(webDistDir, "index.html");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

function run(command, args, options) {
  const result = spawnSync(command, args, {
    shell: false,
    stdio: "inherit",
    ...options,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

run(npmCommand, ["run", "build"], { cwd: webAppDir });

if (!fs.existsSync(webIndexPath)) {
  throw new Error(`Web build did not produce ${webIndexPath}`);
}

console.log(`Prepared bundled web assets from ${webDistDir}`);
