export async function runSmokeCleanup(tasks) {
  const failures = [];
  for (const [name, action] of tasks) {
    try {
      await action();
    } catch (error) {
      failures.push({ name, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return failures;
}
