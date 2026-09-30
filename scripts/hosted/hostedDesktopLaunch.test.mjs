import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { redeemHostedDesktopLaunch } from "./hostedDesktopLaunch.mjs";
import { probeHostedNativePairing } from "./hostedNativePairingProbe.mjs";

function browserFixture({ redeem = true, clearTicket = true } = {}) {
  const companionUrl = "https://localhost:8090";
  const values = new Map([
    ["pixelated_engine_control_url", companionUrl],
    ["pixelated_engine_control_token", "stale-control-token"],
    ["sb-project-auth-token", JSON.stringify({ access_token: "auth" })],
  ]);
  const localStorage = Object.fromEntries(values);
  localStorage.getItem = key => values.get(key) ?? null;
  const window = { localStorage, location: { href: "https://web.example/engine" } };
  const evaluate = (fn, input) => vm.runInNewContext(`(${fn.toString()})(input)`, {
    window, input, URL, AbortSignal, Error, setTimeout,
    fetch: () => { throw new Error("unexpected network request"); },
  });
  const tickets = [];
  const page = {
    async goto(target) {
      const url = new URL(target);
      tickets.push(url.searchParams.get("launchTicket"));
      assert.equal(url.searchParams.get("companionUrl"), companionUrl);
      if (redeem) {
        values.set("pixelated_engine_url", companionUrl);
        values.set("pixelated_engine_token", "companion:fresh-control-token");
        values.set("pixelated_engine_control_token", "fresh-control-token");
      }
      if (clearTicket) url.searchParams.delete("launchTicket");
      window.location.href = url.toString();
    },
    async waitForFunction(predicate, input, options) {
      assert.equal(options.timeout, 20_000);
      assert.equal(evaluate(predicate, input), true, "Pairing did not become ready");
    },
  };
  return { page, companionUrl, values, tickets, evaluate };
}

test("metadata-only restoration requires a fresh ticket before the native probe", async () => {
  const browser = browserFixture();
  await assert.rejects(browser.evaluate(probeHostedNativePairing, {
    apiUrl: "https://api.example", gameId: "game", sessionId: "session",
  }), /requires an active desktop pairing/);
  let sequence = 0;
  const connect = () => redeemHostedDesktopLaunch({
    ...browser, webUrl: "https://web.example", createLaunchTicket: () => `ticket-${++sequence}`,
  });
  await connect();
  browser.values.delete("pixelated_engine_url");
  browser.values.delete("pixelated_engine_token");
  await connect();
  assert.deepEqual(browser.tickets, ["ticket-1", "ticket-2"]);
  assert.equal(browser.values.get("pixelated_engine_url"), browser.companionUrl);
  assert.equal(browser.values.get("pixelated_engine_token"), "companion:fresh-control-token");
});

test("restored URL or stale control credentials alone do not satisfy pairing readiness", async () => {
  const browser = browserFixture({ redeem: false });
  browser.values.set("pixelated_engine_url", browser.companionUrl);
  await assert.rejects(redeemHostedDesktopLaunch({
    ...browser, webUrl: "https://web.example", createLaunchTicket: () => "ticket",
  }), /Pairing did not become ready/);
});

test("pairing waits for the launch ticket to be removed from the page URL", async () => {
  const browser = browserFixture({ clearTicket: false });
  await assert.rejects(redeemHostedDesktopLaunch({
    ...browser, webUrl: "https://web.example", createLaunchTicket: () => "ticket",
  }), /Pairing did not become ready/);
});
