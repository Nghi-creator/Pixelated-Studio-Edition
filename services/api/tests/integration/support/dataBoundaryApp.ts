import Fastify from "fastify";
import type { FastifyRequest } from "fastify";
import type { User } from "@supabase/supabase-js";
import { registerAccessLogRoutes } from "../../../src/modules/observability/http/accessLogRoutes.js";
import { registerAdminSubmissionRoutes } from "../../../src/modules/catalog/http/adminSubmissionRoutes.js";
import { registerAdminUserRoutes } from "../../../src/modules/users/http/adminUserRoutes.js";
import { registerCatalogCandidateRoutes } from "../../../src/modules/catalog/http/catalogCandidateRoutes.js";
import { registerAuthMethodsRoutes } from "../../../src/modules/auth/http/authMethodsRoutes.js";
import { registerCatalogRoutes } from "../../../src/modules/catalog/http/registerCatalogRoutes.js";
import { registerPlayCountRoutes } from "../../../src/modules/catalog/http/playCountRoutes.js";
import { registerLocalPairingRoutes } from "../../../src/modules/multiplayer/http/localPairingRoutes.js";
import { registerMeRoutes } from "../../../src/modules/auth/http/meRoutes.js";
import { registerMetricRoutes } from "../../../src/modules/observability/http/metricRoutes.js";
import { registerModerationRoutes } from "../../../src/modules/moderation/http/registerModerationRoutes.js";
import { registerProfileRoutes } from "../../../src/modules/users/http/profileRoutes.js";
import { registerSubmissionRoutes } from "../../../src/modules/catalog/http/registerSubmissionRoutes.js";
import type { FakeSupabase, RecordRow } from "./dataBoundaryDatabase.js";
import { USER_ID } from "./dataBoundaryFixtures.js";

type TestRequest = FastifyRequest & {
  user?: User;
};

function requireUser(userId = USER_ID) {
  return async (request: FastifyRequest) => {
    const testRequest = request as TestRequest;
    testRequest.user = {
      app_metadata: {},
      aud: "authenticated",
      created_at: new Date().toISOString(),
      email: `${userId}@example.com`,
      id: userId,
      last_sign_in_at: new Date().toISOString(),
      user_metadata: {},
    };
    return undefined;
  };
}

export async function createDataBoundaryApp(
  db: FakeSupabase,
  userId = USER_ID,
  artifactBytes = Buffer.from("test-artifact"),
  extraOptions: RecordRow = {},
) {
  const app = Fastify({ logger: false });
  const fetchArtifact =
    typeof extraOptions.fetchArtifact === "function"
      ? (extraOptions.fetchArtifact as typeof fetch)
      : async () => new Response(artifactBytes);
  const options = {
    ...extraOptions,
    fetchArtifact,
    requireUser: requireUser(userId),
    supabase: db as never,
    supabaseAnon: db as never,
  };

  await registerAccessLogRoutes(app, options);
  await registerAdminUserRoutes(app, options);
  await registerCatalogCandidateRoutes(app, options);
  await registerAuthMethodsRoutes(app);
  await registerCatalogRoutes(app, options);
  await registerPlayCountRoutes(app, options);
  await registerLocalPairingRoutes(app, options);
  await registerMeRoutes(app, options);
  await registerMetricRoutes(app, options);
  await registerModerationRoutes(app, options);
  await registerProfileRoutes(app, options);
  await registerAdminSubmissionRoutes(app, options);
  await registerSubmissionRoutes(app, {
    ...options,
    notifySubmission:
      typeof extraOptions.notifySubmission === "function"
        ? (extraOptions.notifySubmission as never)
        : async () => undefined,
  });
  return app;
}
