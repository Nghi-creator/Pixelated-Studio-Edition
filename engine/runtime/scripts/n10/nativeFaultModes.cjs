/** Closed owned-fixture modes shared by the browser driver and relay. */
const cases = Object.freeze({
  "engineering-game-cancel": "cancel",
  "engineering-game-receiver-loss": "receiver-loss",
  "engineering-game-source-loss": "source-loss",
  "engineering-game-reconnect": "reconnect",
});
const costModes = Object.freeze(Object.fromEntries(Object.keys(cases).map((base) => [base + "-cost", base])));
function faultMode(mode) {
  if (typeof mode !== "string") return null;
  if (mode === "engineering-game-controller-thread-exit-cost") return { base: mode, case: "controller-thread-exit", cost: true };
  if (mode === "engineering-game-worker-stall-cost") return { base: mode, case: "worker-stall", cost: true };
  if (Object.hasOwn(cases, mode)) return { base: mode, case: cases[mode], cost: false };
  if (Object.hasOwn(costModes, mode)) return { base: costModes[mode], case: cases[costModes[mode]], cost: true };
  return null;
}
function shouldForwardReconnect(mode, event) {
  const selected = faultMode(mode);
  return Boolean(selected && ["cancel", "reconnect"].includes(selected.case) && event?.kind === "game_failure_reconnect");
}
module.exports = { faultMode, shouldForwardReconnect };
