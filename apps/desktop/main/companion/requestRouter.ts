import type {
  IncomingMessage,
  ServerResponse,
} from "http";
import { serveCompanionStatus } from "./statusPage";
import {
  proxyHttpRequest,
  shouldProxy,
} from "./proxy";
import { handleInviteRequest } from "./inviteRoutes";
import { handleLaunchRequest } from "./launchRoutes";
import { handleRuntimeSwitchRequest } from "./runtimeSwitchRoutes";
import type { CompanionRequestOptions } from "./types";

export async function handleCompanionRequest(
  req: IncomingMessage,
  res: ServerResponse,
  {
    engineToken,
    launchAllowedOrigins,
    onRuntimeSwitch,
  }: CompanionRequestOptions,
) {
  if (await handleInviteRequest(req, res, launchAllowedOrigins)) {
    return;
  }

  if (await handleLaunchRequest(req, res, launchAllowedOrigins)) {
    return;
  }

  if (
    await handleRuntimeSwitchRequest(
      req,
      res,
      engineToken,
      launchAllowedOrigins,
      onRuntimeSwitch,
    )
  ) {
    return;
  }

  if (shouldProxy(req.url || "")) {
    proxyHttpRequest(req, res, engineToken);
    return;
  }

  serveCompanionStatus(res);
}
