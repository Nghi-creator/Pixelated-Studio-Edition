import fs from "fs";
import http from "http";
import https from "https";
import { type Socket } from "net";
import { createCompanionCertificate } from "./certificate";
import { proxyWebSocket } from "./engine/proxy";
import {
  resetCompanionSecurityState,
  revokeCompanionInvite,
  updateCompanionInvite,
} from "./invite/inviteState";
import { handleCompanionRequest } from "./requestRouter";
import type {
  CompanionRequestOptions,
  CompanionServerOptions,
  CompanionServerResult,
  RuntimeSwitchResult,
} from "./types";

export type {
  CompanionServerOptions,
  CompanionServerResult,
  RuntimeSwitchResult,
} from "./types";

export { getCompanionStatusPage } from "./statusPage";
export { canProxyCompanionRequest, shouldProxy } from "./engine/proxy";
export { consumeCompanionRequestLimit } from "./httpUtils";
export { canUseRuntimeSwitchToken } from "./engine/runtimeSwitchRoutes";
export {
  consumeCompanionLaunchTicket,
  createCompanionLaunchTicket,
  getCompanionInviteStatus,
  recordCompanionInviteFailure,
  revokeCompanionInvite,
  updateCompanionInvite,
} from "./invite/inviteState";

let companionServer: https.Server | null = null;
let companionHttpServer: http.Server | null = null;

export function startCompanionServer({
  certDir,
  engineToken,
  inviteCode,
  inviteExpiresAt,
  lanAddresses,
  launchAllowedOrigins,
  onRuntimeSwitch,
  port,
  preserveSecurityState = false,
}: CompanionServerOptions) {
  stopCompanionServer({ preserveSecurityState });
  if (inviteCode && inviteExpiresAt) {
    updateCompanionInvite(inviteCode, inviteExpiresAt);
  } else {
    revokeCompanionInvite();
  }

  const { certPath, keyPath } = createCompanionCertificate(certDir, lanAddresses);
  const requestOptions: CompanionRequestOptions = {
    engineToken,
    launchAllowedOrigins,
    onRuntimeSwitch,
  };
  const server = https.createServer(
    {
      cert: fs.readFileSync(certPath),
      key: fs.readFileSync(keyPath),
    },
    (req, res) => {
      void handleCompanionRequest(req, res, requestOptions);
    },
  );
  const httpServer = http.createServer((req, res) => {
    void handleCompanionRequest(req, res, requestOptions);
  });

  server.on("upgrade", (req, socket, head) =>
    proxyWebSocket(req, socket as Socket, head, engineToken),
  );

  return new Promise<CompanionServerResult>((resolve, reject) => {
    let httpReady = false;
    let httpsReady = false;
    const httpPort = port + 1;

    const maybeResolve = () => {
      if (!httpReady || !httpsReady) return;
      companionServer = server;
      companionHttpServer = httpServer;
      resolve({
        certPath,
        httpPort,
        keyPath,
        port,
      });
    };

    const handleListenError = (err: Error) => {
      server.close();
      httpServer.close();
      reject(err);
    };

    server.once("error", handleListenError);
    httpServer.once("error", handleListenError);
    httpServer.listen(httpPort, "127.0.0.1", () => {
      httpServer.off("error", handleListenError);
      httpReady = true;
      maybeResolve();
    });
    server.listen(port, "0.0.0.0", () => {
      server.off("error", handleListenError);
      httpsReady = true;
      maybeResolve();
    });
  });
}

export function stopCompanionServer(options: { preserveSecurityState?: boolean } = {}) {
  if (companionServer) {
    companionServer.close();
    companionServer = null;
  }
  if (companionHttpServer) {
    companionHttpServer.close();
    companionHttpServer = null;
  }
  if (!options.preserveSecurityState) {
    resetCompanionSecurityState();
  }
}
