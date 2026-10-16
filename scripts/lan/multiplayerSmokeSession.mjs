import { fetchHealth, summarizeHealth, sleep, getRuntimeActiveSessionId, getCameraPeerState } from "./multiplayerSmokeHealth.mjs";
export async function pollUntil({ description, engineUrl, log, predicate, pollMs, timeoutMs }) {
  const startedAt = Date.now();
  let lastHealth = null;
  while (Date.now() - startedAt <= timeoutMs) {
    const health = await fetchHealth(engineUrl);
    lastHealth = health;
    const summary = summarizeHealth(health);
    log.write("health-poll", {
      description,
      summary,
    });
    if (predicate(health, summary)) {
      return health;
    }
    await sleep(pollMs);
  }
  const lastSummary = lastHealth ? summarizeHealth(lastHealth) : null;
  throw new Error(`Timed out waiting for ${description}. Last health summary: ${JSON.stringify(lastSummary)}`);
}
export function assertSessionSurvived({ expectedSessionId, health, phase }) {
  const runtimeActiveSessionId = getRuntimeActiveSessionId(health);
  const cameraSessionId = getCameraPeerState(health).sessionId;
  if (!runtimeActiveSessionId) {
    throw new Error(`${phase}: engine has no active session.`);
  }
  if (runtimeActiveSessionId !== expectedSessionId) {
    throw new Error(`${phase}: active session changed from ${expectedSessionId} to ${runtimeActiveSessionId}.`);
  }
  if (cameraSessionId && cameraSessionId !== expectedSessionId) {
    throw new Error(`${phase}: camera peer state belongs to ${cameraSessionId}, expected ${expectedSessionId}.`);
  }
}
