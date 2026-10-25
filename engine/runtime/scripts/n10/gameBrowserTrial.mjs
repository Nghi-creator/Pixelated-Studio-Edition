#!/usr/bin/env node
// Explicit local experiment. No app profile, login, hosted service or LAN endpoint.
import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { installReceiver } from "./gameBrowserReceiver.mjs";

const runtime = fileURLToPath(new URL("../../", import.meta.url));
const sha = (value) => createHash("sha256").update(value).digest("hex");

export function parseOptions(arguments_) {
  const options = {};
  const allowed = new Set(["--mode", "--image", "--output", "--state-directory"]);
  for (let index = 0; index < arguments_.length; index += 2) {
    const key = arguments_[index];
    if (!allowed.has(key) || key in options || typeof arguments_[index + 1] !== "string" || !arguments_[index + 1])
      throw new Error("explicit trial arguments required");
    options[key] = arguments_[index + 1];
  }
  if (Object.keys(options).length !== 4 || !["changed", "sham", "cancel", "disconnect"].includes(options["--mode"])
      || !/^sha256:[a-f0-9]{64}$/.test(options["--image"])) throw new Error("invalid trial arguments");
  return options;
}

export function processCpuSample(info, atNs) {
  if (!Array.isArray(info) || info.length > 128 || !info.length) throw new Error("process inventory unavailable");
  let cpu = 0;
  const identities = [];
  for (const item of info) {
    if (!Number.isSafeInteger(item.id) || item.id < 1 || typeof item.type !== "string"
        || !Number.isFinite(item.cpuTime) || item.cpuTime < 0 || item.cpuTime > Number.MAX_SAFE_INTEGER) throw new Error("process counter unavailable");
    identities.push([item.id, item.type]);
    cpu += item.cpuTime;
  }
  if (new Set(identities.map((item) => item[0])).size !== identities.length)
    throw new Error("duplicate browser process identity");
  identities.sort((a, b) => a[0] - b[0]);
  return { host_at_ns: atNs, cpu_seconds: cpu, process_count: identities.length,
    inventory_hash: sha(JSON.stringify(identities)) };
}

export async function runTrial(options) {
  options = parseOptions(Object.entries(options).flat());
  const docker = process.platform === "darwin"
    ? "/Applications/Docker.app/Contents/Resources/bin/docker" : "docker";
  const state = path.resolve(options["--state-directory"]);
  if (state.includes(",")) throw new Error("invalid state mount path");
  const metadata = await fs.lstat(state);
  if (!metadata.isDirectory() || metadata.isSymbolicLink() || (metadata.mode & 0o777) !== 0o700
      || metadata.uid !== process.getuid() || (await fs.readdir(state)).length)
    throw new Error("new private state directory required");
  // Exclusive output prevents replacing source/configuration or a previous receipt.
  const output = await fs.open(path.resolve(options["--output"]), "wx", 0o600);
  const name = `n10-game-browser-${process.pid}-${Date.now()}`;
  let browser, page, child, timer, resourceTimer, failure;
  let phase = "setup", report = null, exitCode = null, outputBytes = 0, closing = false;
  const origin = process.hrtime.bigint();
  const now = () => Number(process.hrtime.bigint() - origin);
  const browserResources = [];
  const stderrHash = createHash("sha256");
  let stderrBytes = 0;
  const sources = {};
  const envelope = { version: "n10-game-browser-acquisition-v1", mode: options["--mode"],
    image_hash: options["--image"], live_authority: false,
    browser_clock_basis: "browser_performance_relative_ns",
    worker_clock_basis: "worker_monotonic_relative_ns",
    host_clock_basis: "harness_monotonic_relative_ns",
    clock_alignment: "none", report: null, browser_resources: browserResources };
  try {
    for (const directory of ["live_probe_control", "scripts/n10"]) {
      for (const file of (await fs.readdir(path.join(runtime, directory))).sort()) {
        if (!/\.(py|mjs)$/.test(file)) continue;
        const relative = `${directory}/${file}`;
        sources[relative] = sha(await fs.readFile(path.join(runtime, relative)));
      }
    }
    sources["private_journal.py"] = sha(await fs.readFile(path.join(runtime, "private_journal.py")));
    envelope.source_hashes = sources;
    browser = await chromium.launch({ headless: true,
      args: ["--disable-features=WebRtcHideLocalIpsWithMdns"] });
    envelope.browser_version = browser.version();
    const context = await browser.newContext({ viewport: { width: 800, height: 600 } });
    await context.route("**/*", (route) => route.abort());
    page = await context.newPage();
    let sent = 0;
    await page.exposeFunction("signalWorker", (message) => {
      if (++sent > 2000) throw new Error("browser event budget exceeded");
      const text = JSON.stringify(message) + "\n";
      if (text.length > 32768 || !child || child.stdin.destroyed) return;
      if (child.stdin.writableLength > 65536) throw new Error("browser control backpressure");
      child.stdin.write(text);
    });
    await page.evaluate(installReceiver);
    const session = await browser.newBrowserCDPSession();
    async function sampleResources() {
      try {
        if (browserResources.length >= 128) throw new Error("browser resource limit");
        const result = await session.send("SystemInfo.getProcessInfo");
        browserResources.push(processCpuSample(result.processInfo, now()));
      } catch { envelope.browser_resource_error = "counter_unavailable"; }
      if (!closing && !report && !failure) resourceTimer = setTimeout(sampleResources, 250);
    }
    await sampleResources();
    phase = "worker";
    const args = ["run", "--rm", "--init", "--name", name, "--pull", "never", "--read-only",
      "--cap-drop", "ALL", "--security-opt", "no-new-privileges", "--cpus", "2", "--memory", "768m",
      "--pids-limit", "128", "--network", "bridge", "--tmpfs", "/tmp:rw,nosuid,nodev,noexec,size=64m",
      "--tmpfs", "/home/pixelated:rw,nosuid,nodev,noexec,uid=10001,gid=10001,size=32m",
      "--env", "XDG_CACHE_HOME=/tmp/cache", "--env", "PYTHONPYCACHEPREFIX=/tmp/pycache", "--workdir", "/opt/runtime"];
    for (const [source, target, readonly] of [
      [path.join(runtime, "live_probe_control"), "/opt/runtime/live_probe_control", true],
      [path.join(runtime, "private_journal.py"), "/opt/runtime/private_journal.py", true],
      [state, "/state", false],
    ]) args.push("--mount", `type=bind,src=${source},dst=${target}${readonly ? ",readonly" : ""}`);
    args.push("--entrypoint", "timeout", "-i", options["--image"], "35s", "python3", "-m",
      "live_probe_control.browser_game_worker", "--isolated-game-browser", options["--mode"], "--state-directory", "/state");
    child = spawn(docker, args, { stdio: ["pipe", "pipe", "pipe"] });
    child.stdin.on("error", () => undefined); // Exit/closed-pipe outcome is retained below.
    const exited = new Promise((resolve) => {
      child.once("error", (error) => resolve(error));
      child.once("close", (code) => { exitCode = code; resolve(); });
    });
    child.stderr.on("data", (data) => {
      stderrBytes += data.length;
      if (stderrBytes <= 65536) stderrHash.update(data);
    });
    child.stdout.on("data", (data) => {
      outputBytes += data.length;
      if (outputBytes > 1024 * 1024) child.kill();
    });
    const read = async () => {
      for await (const line of readline.createInterface({ input: child.stdout })) {
        if (line.length > 512 * 1024 || outputBytes > 1024 * 1024) throw new Error("worker report limit");
        const item = JSON.parse(line);
        if (item.type === "report") {
          if (report) throw new Error("duplicate worker report");
          report = item.data;
          try {
            const pixels = await page.screenshot({ type: "png", timeout: 2000 });
            const artifact = await fs.open(options["--output"] + ".png", "wx", 0o600);
            try { await artifact.writeFile(pixels); } finally { await artifact.close(); }
            envelope.receiver_screenshot_hash = "sha256:" + sha(pixels);
          } catch { envelope.receiver_screenshot_hash = null; }
        } else if (["offer", "ice", "disconnect"].includes(item.type)) {
          await page.evaluate((message) => globalThis.receiveWorker(message), item);
        } else throw new Error("unknown worker event");
      }
      const launchError = await exited;
      if (launchError || !report) throw new Error("worker report unavailable");
    };
    await Promise.race([read(), new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("outer trial deadline")), 40000);
    })]);
    phase = "completed";
  } catch { failure = phase + "_failed"; }
  finally {
    closing = true;
    clearTimeout(timer);
    clearTimeout(resourceTimer);
    // The exact created container owns all game/display/worker descendants.
    const cleanup = spawnSync(docker, ["rm", "-f", name], { timeout: 10000, encoding: "utf8" });
    envelope.container_cleanup = cleanup.status === 0 || /No such container/.test(cleanup.stderr || "")
      ? "removed_or_already_removed" : "unknown";
    if (envelope.container_cleanup === "unknown") failure = "container_cleanup_failed";
    child?.kill();
    if (page) await page.evaluate(() => globalThis.stopReceiver()).catch(() => undefined);
    if (browser) await browser.close().catch(() => { failure = "browser_cleanup_failed"; });
    Object.assign(envelope, { report, worker_exit_code: exitCode, failure: failure || null,
      stderr_bytes: stderrBytes, bounded_stderr_hash: "sha256:" + stderrHash.digest("hex") });
    try { await output.writeFile(JSON.stringify(envelope, null, 2) + "\n"); await output.sync(); }
    finally { await output.close(); }
  }
  return envelope;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await runTrial(parseOptions(process.argv.slice(2)));
    if (result.failure || result.report?.status !== "observed" || result.worker_exit_code !== 0)
      process.exitCode = 1;
  } catch { console.error("error: isolated game/browser trial invalid_input_or_output"); process.exitCode = 2; }
}
