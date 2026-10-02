import fs from "node:fs";
import { pathToFileURL } from "node:url";
import {
  repository, requirePolicy, validatePull, validateChanges, validateRelease, validateRules, validateChecks,
} from "./dependabotMergePolicy.mjs";

export async function evaluatePull({ number, api, registry, dryRun = true, expectedHead }) {
  requirePolicy(Number.isSafeInteger(number) && number > 0, "Invalid PR number");
  const route = `/repos/${repository}`;
  const pr = await api(`${route}/pulls/${number}`);
  validatePull(pr);
  requirePolicy(!expectedHead || pr.head.sha === expectedHead, "Completed workflow belongs to an older commit");
  const rules = await api(`${route}/rules/branches/main`, { list: true });
  validateRules(rules);
  const commits = await api(`${route}/pulls/${number}/commits`, { list: true });
  requirePolicy(commits.length === pr.commits && commits.length > 0 && commits.every(commit =>
    commit.author?.login === "dependabot[bot]" && commit.commit?.verification?.verified === true),
  "Every PR commit must be verified and authored by Dependabot");
  const files = await api(`${route}/pulls/${number}/files`, { list: true });
  requirePolicy(files.length === pr.changed_files && files.length <= 10, "Incomplete or oversized file list");
  const changes = [];
  for (const file of files) {
    // Reject filenames before using them as API paths.
    requirePolicy(/^(?:(?:apps\/(?:web|desktop)|services\/api|engine\/runtime)\/)?package(?:-lock)?\.json$/.test(file.filename) &&
      file.status === "modified", "Unexpected changed file");
    const read = async ref => {
      const data = await api(`${route}/contents/${file.filename}?ref=${ref}`);
      requirePolicy(data.encoding === "base64" && typeof data.content === "string", "File content unavailable");
      return JSON.parse(Buffer.from(data.content, "base64").toString("utf8"));
    };
    changes.push({ ...file, before: await read(pr.base.sha), after: await read(pr.head.sha) });
  }
  const releases = validateChanges(changes);
  for (const release of releases) validateRelease(release, await registry(release.name));
  const checks = await api(`${route}/commits/${pr.head.sha}/check-runs`, { list: true, key: "check_runs" });
  validateChecks(checks, files.map(file => file.filename));
  const fresh = await api(`${route}/pulls/${number}`);
  validatePull(fresh);
  requirePolicy(fresh.head.sha === pr.head.sha && fresh.base.sha === pr.base.sha &&
    fresh.mergeable === true && fresh.mergeable_state === "clean", "PR changed or GitHub has not cleared its merge protections");
  if (dryRun) return `PR #${number}: eligible (dry run; nothing merged)`;
  // Atomic head match prevents merging a replacement commit after validation.
  // GitHub still enforces branch rules, reviews, strict checks, and merge restrictions.
  const result = await api(`${route}/pulls/${number}/merge`, {
    method: "PUT", body: { sha: pr.head.sha, merge_method: "squash" },
  });
  requirePolicy(result.merged === true, "GitHub did not merge the PR");
  return `PR #${number}: squash merged ${pr.head.sha}`;
}

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, { ...options, redirect: "error", signal: AbortSignal.timeout(30_000) });
  requirePolicy(response.ok, `Request failed with HTTP ${response.status}`);
  return response.json();
}

async function main() {
  requirePolicy(process.env.GITHUB_REPOSITORY === repository && process.env.GITHUB_REF === "refs/heads/main",
    "Workflow must run from the trusted main branch");
  requirePolicy(!!process.env.GITHUB_TOKEN, "Missing GitHub token");
  const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
  const manual = process.env.GITHUB_EVENT_NAME === "workflow_dispatch";
  requirePolicy(manual || process.env.GITHUB_EVENT_NAME === "workflow_run", "Unsupported trigger");
  const enabled = process.env.AUTOMERGE_ENABLED === "true";
  if (!manual && !enabled) {
    console.log("Dependabot automatic merging is disabled.");
    return;
  }
  if (!manual) requirePolicy(event.workflow_run?.event === "pull_request" &&
    event.workflow_run?.conclusion === "success" && event.workflow_run?.head_repository?.full_name === repository,
  "Not a successful same-repository PR workflow");

  const api = async (route, { list = false, key, method = "GET", body } = {}) => {
    requirePolicy(route.startsWith(`/repos/${repository}/`), "Unexpected API route");
    const results = [];
    for (let page = 1; page <= 10; page++) {
      const query = list ? `${route.includes("?") ? "&" : "?"}per_page=100&page=${page}` : "";
      const data = await jsonRequest(`https://api.github.com${route}${query}`, {
        method,
        headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      if (!list) return data;
      const items = key ? data[key] : data;
      requirePolicy(Array.isArray(items), "Unexpected paginated API response");
      results.push(...items);
      if (items.length < 100) return results;
    }
    throw new Error("API result exceeds safe pagination limit");
  };
  const registry = name => jsonRequest(`https://registry.npmjs.org/${encodeURIComponent(name)}`);
  const candidates = manual ? [{ number: Number(process.env.PR_NUMBER) }] : event.workflow_run.pull_requests;
  requirePolicy(Array.isArray(candidates), "Missing workflow PR association");
  if (!candidates.length) console.log("No associated PR; use the manual dry run to inspect eligibility.");
  for (const candidate of candidates) {
    try {
      console.log(await evaluatePull({ number: candidate.number, api, registry, dryRun: manual,
        expectedHead: manual ? undefined : event.workflow_run.head_sha }));
    } catch (error) {
      // Ineligible or temporarily pending PRs remain for manual review. No bypass or retry of writes.
      console.log(`PR #${candidate.number}: left unmerged — ${error.message}`);
      if (manual) process.exitCode = 1;
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
