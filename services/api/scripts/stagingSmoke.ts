/// <reference types="node" />
import "dotenv/config";
import { createStagingConfig, parseArgs } from "./staging/config.js";
import { createStagingClient } from "./staging/client.js";
import { createCatalogChecks } from "./staging/catalog.js";
import { createStorageChecks } from "./staging/storage.js";
import { createSessionsChecks } from "./staging/sessions.js";
async function main() {
  const mode = parseArgs(process.argv.slice(2));
  const config = createStagingConfig();
  const { apiUrl } = config;
  const client = createStagingClient(config);
  const context = { ...config, ...client };
  const { predeployCatalogRpcCheck, smokeCatalogCaching, findSmokeGameId } = createCatalogChecks(context);
  const { smokeIdentity, smokeAccessLogStorage, predeployAccessLogSchemaCheck, predeploySubmissionCleanupPolicyCheck } = createStorageChecks(context);
  const { smokeLocalPairing, smokeMultiplayerLobby, smokeSessionAndMetrics } = createSessionsChecks(context);
  console.log(`staging smoke target: ${apiUrl}`);
  if (mode === "catalog-rpc") {
    await predeployCatalogRpcCheck();
    console.log("hosted published catalog RPC predeploy check passed");
    return;
  }
  client.setBearerToken(await client.resolveBearerToken());
  if (mode === "access-log-schema") {
    await predeployAccessLogSchemaCheck();
    console.log("hosted access-log schema predeploy check passed");
    return;
  }
  if (mode === "submission-cleanup-policy") {
    await predeploySubmissionCleanupPolicyCheck();
    console.log("hosted submission cleanup policy predeploy check passed");
    return;
  }
  await smokeCatalogCaching();
  const permissions = await smokeIdentity();
  await smokeAccessLogStorage(permissions.abilities?.canAccessAdmin === true);
  await predeploySubmissionCleanupPolicyCheck();
  const gameId = await findSmokeGameId();
  await smokeLocalPairing();
  await smokeMultiplayerLobby(gameId);
  await smokeSessionAndMetrics(gameId);
  console.log("staging smoke passed");
}
main().catch(error => { console.error(`staging smoke failed: ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; });
