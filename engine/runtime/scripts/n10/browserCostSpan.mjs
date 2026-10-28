/** Two cumulative CPU observations of the owned browser; separate host clock. */
import { processCpuSample } from "./gameBrowserTrial.mjs";

async function bounded(promise) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("browser cost span deadline")), 1000); })]); }
  finally { clearTimeout(timer); }
}

export class BrowserCostSpan {
  constructor(browser) { this.browser = browser; this.result = null; }
  async sample() {
    return processCpuSample((await bounded(this.session.send("SystemInfo.getProcessInfo"))).processInfo, Number(process.hrtime.bigint()));
  }
  async start() {
    this.session = await bounded(this.browser.newBrowserCDPSession());
    this.before = await this.sample();
  }
  async finish(outcome) {
    if (this.result) return this.result;
    this.result = { method: "n10-browser-cost-span-v1", basis: "host_hrtime_browser_owned_process_cpu_separate_clock", outcome, before: this.before || null, after: null, failure: null };
    try { this.result.after = await this.sample(); }
    catch { this.result.failure = "browser_process_observation_unavailable"; }
    finally { try { await bounded(this.session?.detach()); } catch { this.result.failure ||= "browser_cost_session_cleanup_unavailable"; } }
    return this.result;
  }
}
