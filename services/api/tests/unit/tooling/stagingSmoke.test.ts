import assert from "node:assert/strict";
import test from "node:test";
import { createStagingConfig, parseArgs } from "../../../scripts/staging/config.js";
import { createStagingClient } from "../../../scripts/staging/client.js";
import { createCatalogChecks } from "../../../scripts/staging/catalog.js";
import { createStorageChecks } from "../../../scripts/staging/storage.js";
import { createSessionsChecks } from "../../../scripts/staging/sessions.js";
function configuration() { return createStagingConfig({ STAGING_API_URL: "https://api.test", STAGING_SUPABASE_URL: "https://project.supabase.co", STAGING_SUPABASE_ANON_KEY: "anonymous-key" }); }
for (const code of ["42501", "PGRST202", "PGRST301", "FETCH_ERROR"])
  test(`catalog denial distinguishes permission failures from ${code}`, async (t) => {
    const config = configuration();
    t.mock.method(globalThis, "fetch", async (input: Parameters<typeof fetch>[0]) => String(input).includes("/rest/v1/rpc/")
      ? Response.json({ code, message: "probe failure" }, { status: 403 }) : Response.json({ games: [] }));
    const checks = createCatalogChecks({ ...config, ...createStagingClient(config) });
    if (["42501", "PGRST202"].includes(code))
      await checks.predeployCatalogRpcCheck();
    else
      await assert.rejects(checks.predeployCatalogRpcCheck(), /did not prove/);
  });
for (const removed of [false, true])
  test(`storage cleanup requires a confirmed removed probe: ${removed}`, async (t) => {
    const config = configuration();
    let objectPath = "";
    t.mock.method(globalThis, "fetch", async (input: Parameters<typeof fetch>[0], options?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/me"))
        return Response.json({ user: { id: "smoke-user" } });
      if (options?.method === "DELETE")
        return Response.json(removed ? [{ name: objectPath }] : []);
      objectPath = url.split("/object/submissions/")[1] || "";
      return Response.json({ Key: `submissions/${objectPath}` });
    });
    const client = createStagingClient(config);
    client.setBearerToken("smoke-bearer");
    const checks = createStorageChecks({ ...config, ...client });
    if (removed)
      await checks.predeploySubmissionCleanupPolicyCheck();
    else
      await assert.rejects(checks.predeploySubmissionCleanupPolicyCheck(), /missing or denying/);
    assert.match(objectPath, /smoke-user\/roms\/cleanup-policy/);
  });
test("failed pairing update restores a known pairing without deleting it first", async () => {
  const config = configuration();
  const mutations: unknown[] = [];
  const client = createStagingClient(config, async (_input, options) => {
    if (options?.method === "GET")
      return Response.json({ pairing: { engineUrl: "http://127.0.0.1:9000" } });
    mutations.push([options?.method, JSON.parse(String(options?.body))]);
    return mutations.length === 1 ? Response.json({ error: "unavailable" }, { status: 503 }) : Response.json({ status: "paired" });
  });
  await assert.rejects(createSessionsChecks({ ...config, ...client }).smokeLocalPairing(), /503/);
  assert.deepEqual(mutations, [["POST", { engineUrl: "http://127.0.0.1:8080" }], ["POST", { engineUrl: "http://127.0.0.1:9000" }]]);
});
test("failed pairing inventory cannot fabricate an absent pairing and mutate it", async () => {
  const config = configuration();
  let calls = 0;
  const client = createStagingClient(config, async () => { calls++; return new Response(null, { status: 503 }); });
  await assert.rejects(createSessionsChecks({ ...config, ...client }).smokeLocalPairing(), /503/);
  assert.equal(calls, 1);
});
for (const text of ['{"error":"private-token"}', "private-token not JSON"])
  test("staging failures never echo response secrets", async () => {
    const config = configuration();
    const client = createStagingClient(config, async () => new Response(text, { status: 502 }));
    await assert.rejects(client.request("GET", "/me"), error => error instanceof Error && !error.message.includes("private-token"));
  });
test("staging command arguments fail closed before creating an authenticated run", () => {
  assert.equal(parseArgs([]), "full");
  assert.equal(parseArgs(["--catalog-rpc-only"]), "catalog-rpc");
  assert.throws(() => parseArgs(["--catalog-rpc-only", "--unexpected"]), /Unknown/);
});
test("admin/submission writes send the approved Studio origin while public reads do not", async () => {
  const config = createStagingConfig({ STAGING_API_URL: "https://api.test", STAGING_STUDIO_ORIGIN: "https://studio.test/player" });
  const calls: [
    string,
    string | null
  ][] = [];
  const client = createStagingClient(config, async (input, options) => { calls.push([String(input), new Headers(options?.headers).get("origin")]); return Response.json({}); });
  await client.request("POST", "/admin/probe", { body: {} });
  await client.request("POST", "/submissions/games", { body: {} });
  await client.request("GET", "/games");
  assert.deepEqual(calls, [["https://api.test/admin/probe", "https://studio.test"], ["https://api.test/submissions/games", "https://studio.test"], ["https://api.test/games", null]]);
});


test("ambiguous storage upload failure still attempts cleanup of its exact owned probe",async t=>{
 const config=configuration();const deleted:string[]=[];let objectPath="";
 t.mock.method(globalThis,"fetch",async(input:Parameters<typeof fetch>[0],options?:RequestInit)=>{
  const url=String(input);
  if(url.endsWith("/me"))return Response.json({user:{id:"smoke-user"}});
  if(options?.method==="DELETE"){deleted.push(...JSON.parse(String(options.body)).prefixes);return Response.json([{name:objectPath}]);}
  objectPath=url.split("/object/submissions/")[1]||"";
  return Response.json({message:"private-response"},{status:503});
 });
 const client=createStagingClient(config);client.setBearerToken("smoke-bearer");
 await assert.rejects(createStorageChecks({...config,...client}).predeploySubmissionCleanupPolicyCheck(),error=>error instanceof Error&&/cleanup was attempted/.test(error.message)&&!error.message.includes("private-response"));
 assert.deepEqual(deleted,[objectPath]);assert.match(objectPath,/smoke-user\/roms\/cleanup-policy/);
});
