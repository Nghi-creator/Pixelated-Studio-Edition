import assert from "node:assert/strict";
import { createStagingSupabase } from "./client.js";
import { logStep, uniqueId } from "./config.js";
import type { JsonRecord, StagingContext } from "./client.js";
export function createStorageChecks(context: StagingContext) {
  const { request, getBearerToken, stagingSupabaseUrl, stagingSupabaseAnonKey } = context;
  async function smokeIdentity() {
    logStep("checking signed-in identity");
    const { payload: me } = await request<{
      user?: {
        id?: string;
      };
    }>("GET", "/me");
    assert.equal(typeof me.user?.id, "string", "/me should include user.id");
    logStep("checking signed-in permissions");
    const { payload: permissions } = await request<{
      abilities?: JsonRecord;
      profile?: JsonRecord;
    }>("GET", "/me/permissions");
    assert.equal(typeof permissions.abilities, "object", "/me/permissions should include abilities");
    assert.equal(typeof permissions.profile, "object", "/me/permissions should include profile");
    return permissions;
  }
  async function smokeAccessLogStorage(canAccessAdmin: boolean) {
    const sessionId = uniqueId("staging-smoke-access-log");
    logStep("checking hosted access-log write schema");
    await request("POST", "/access-logs", {
      body: { path: "/staging-smoke/access-log/first", sessionId },
      expected: 202,
    });
    logStep("checking hosted access-log session upsert schema");
    await request("POST", "/access-logs", {
      body: { path: "/staging-smoke/access-log/updated", sessionId },
      expected: 202,
    });
    if (canAccessAdmin) {
      logStep("checking hosted access-log summary RPC schema");
      const { payload } = await request<{
        logs?: unknown[];
      }>("GET", "/admin/access-logs?page=1&pageSize=1");
      assert.equal(Array.isArray(payload.logs), true);
    }
    else {
      logStep("skipping admin access-log summary RPC check for non-admin token");
    }
  }
  async function predeployAccessLogSchemaCheck() {
    const permissions = await smokeIdentity();
    if (permissions.abilities?.canAccessAdmin !== true) {
      throw new Error("The hosted access-log predeploy check requires an admin or super-admin bearer token so public.admin_access_log_summary is verified.");
    }
    await smokeAccessLogStorage(true);
  }
  async function predeploySubmissionCleanupPolicyCheck() {
    if (!stagingSupabaseUrl || !stagingSupabaseAnonKey) {
      throw new Error("Missing Supabase storage configuration for submission cleanup policy check. " +
        "Provide STAGING_SUPABASE_URL and STAGING_SUPABASE_ANON_KEY.");
    }
    const { payload: me } = await request<{
      user?: {
        id?: string;
      };
    }>("GET", "/me");
    const userId = me.user?.id;
    if (!userId) {
      throw new Error("Submission cleanup policy check requires /me to return user.id.");
    }
    const objectPath = `${userId}/roms/${uniqueId("cleanup-policy")}.nes`;
    const supabase = createStagingSupabase(stagingSupabaseUrl, stagingSupabaseAnonKey, getBearerToken());
    const storage = supabase.storage.from("submissions");
    logStep("checking hosted submission storage upload policy");
    let uploadConfirmed = false;
    try {
      const upload = await storage.upload(objectPath, new Blob(["NES\x1a staging smoke cleanup policy\n"], {
        type: "application/octet-stream",
      }), {contentType: "application/octet-stream", upsert: false});
      uploadConfirmed = !upload.error;
    } catch { /* A lost acknowledgement can still mean that our probe was created. */ }
    logStep("checking hosted submission cleanup storage policy");
    const removal = await storage.remove([objectPath]).catch(() => ({data:null,error:new Error("Cleanup request failed.")}));
    if (!uploadConfirmed) {
      throw new Error("Hosted submission storage upload probe failed; owned probe cleanup was attempted. " +
        "Apply migration supabase/migrations/20260908090000_repair_submission_storage_write_policies.sql " +
        `and inspect submissions/${objectPath} if cleanup was not confirmed.`);
    }
    if (removal.error || !removal.data?.some(item => item.name === objectPath)) {
      throw new Error("Hosted submission cleanup storage policy is missing or denying authenticated cleanup. " +
        "Apply migration supabase/migrations/20260908090000_repair_submission_storage_write_policies.sql " +
        "to the hosted Supabase project before deploying. " +
        `Delete was not confirmed for submissions/${objectPath}.`);
    }
  }
  return { smokeIdentity, smokeAccessLogStorage, predeployAccessLogSchemaCheck, predeploySubmissionCleanupPolicyCheck };
}
