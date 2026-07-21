import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

type PackageJson = {
  scripts?: Record<string, string>;
};

const packageJson = JSON.parse(
  readFileSync(new URL("../../../package.json", import.meta.url), "utf8"),
) as PackageJson;
const stagingSmoke = readFileSync(
  new URL("../../../scripts/stagingSmoke.ts", import.meta.url),
  "utf8",
);

test("hosted predeploy fails fast on hosted Supabase schema drift", () => {
  const scripts = packageJson.scripts || {};

  assert.match(
    scripts["check:submission-cleanup-policy"] || "",
    /--submission-cleanup-policy-only/,
  );
  assert.match(scripts["check:catalog-rpc"] || "", /--catalog-rpc-only/);
  assert.match(
    scripts["predeploy:hosted"] || "",
    /check:access-log-schema && npm run check:submission-cleanup-policy && npm run check:catalog-rpc && npm run check:catalog-candidate-imports && npm run typecheck/,
  );
  assert.match(stagingSmoke, /STAGING_STUDIO_ORIGIN/);
  assert.match(stagingSmoke, /Origin: stagingStudioOrigin/);
});
