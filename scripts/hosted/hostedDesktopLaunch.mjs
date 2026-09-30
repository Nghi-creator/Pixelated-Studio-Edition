// Reconnect through the real one-time ticket flow; metadata alone is not pairing.
export async function redeemHostedDesktopLaunch({ page, webUrl, companionUrl, createLaunchTicket }) {
  const launchUrl = new URL("/engine", webUrl);
  launchUrl.searchParams.set("companionUrl", companionUrl);
  launchUrl.searchParams.set("launchTicket", createLaunchTicket());
  await page.goto(launchUrl.toString(), { waitUntil: "domcontentloaded" });
  await page.waitForFunction((expectedUrl) => {
    const storage = window.localStorage;
    const engineToken = storage.getItem("pixelated_engine_token");
    const controlToken = storage.getItem("pixelated_engine_control_token");
    return storage.getItem("pixelated_engine_url") === expectedUrl &&
      storage.getItem("pixelated_engine_control_url") === expectedUrl &&
      Boolean(controlToken) && engineToken === `companion:${controlToken}` &&
      !new URL(window.location.href).searchParams.has("launchTicket");
  }, companionUrl, { timeout: 20_000 });
}
