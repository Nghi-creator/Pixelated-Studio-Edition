/** Cleanup uncertainty must stop acquisition without discarding the original evidence. */
export function requireAcceptanceCleanup(failure, acquisition, container, resources) {
  const issues = [];
  if (!resources.every((item) => item.status === "fulfilled")) issues.push("acceptance browser/assets cleanup unconfirmed");
  if (container.status !== 0 && !/No such container/.test(container.stderr || "")) issues.push("acceptance container cleanup unconfirmed");
  if (!issues.length) return;
  const error = new Error([...issues, ...(failure ? [failure.message] : [])].join("\n"), { cause: failure });
  if (acquisition) error.acquisition = { ...acquisition, status: "failed", cleanup_failures: issues };
  throw error;
}
