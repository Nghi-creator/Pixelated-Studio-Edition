import { runSmokeCleanup } from "../shared/smokeCleanup.mjs";
import { deactivateTelemetryCapture } from "./multiplayerSmokeTelemetry.mjs";
export async function disconnectOwnedGuests(run) {
  const failures = await runSmokeCleanup((run.automatedGuests || []).map((guest, index) => [
    `disconnect guest ${index + 1}`, () => guest.disconnect(),
  ]));
  if (failures.length)
    throw new AggregateError(failures.map(item => new Error(item.error)), "Guest cleanup failed.");
  run.automatedGuests = [];
}
export async function cleanupRun(run, deactivate = deactivateTelemetryCapture) {
  return runSmokeCleanup([
    ...run.automatedGuests.map((guest, index) => [`disconnect guest ${index + 1}`, () => guest.disconnect()]),
    ["deactivate telemetry", async () => {
        if (run.captureToken) {
          await deactivate(run.options.engineUrl, run.captureToken);
          run.captureToken = null;
        }
      }],
  ]);
}
export async function connectOwnedGuests(run, count, connect) {
  if (!Number.isSafeInteger(count) || count < 1 || count > 16)
    throw new Error("Invalid smoke guest count.");
  for (let index = 0; index < count; index++)
    run.automatedGuests.push(await connect(index));
}
