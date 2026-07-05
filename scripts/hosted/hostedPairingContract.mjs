import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

export function assertHostedPairingContract(rootDir) {
  const desktopController = fs.readFileSync(
    path.join(
      rootDir,
      "apps",
      "desktop",
      "main",
      "engine",
      "controller.ts",
    ),
    "utf8",
  );
  const desktopCompanion = fs.readFileSync(
    path.join(
      rootDir,
      "apps",
      "desktop",
      "main",
      "companion",
      "server.ts",
    ),
    "utf8",
  );
  const launchPairing = fs.readFileSync(
    path.join(
      rootDir,
      "apps",
      "web",
      "src",
      "lib",
      "engine",
      "desktopLaunchPairing.ts",
    ),
    "utf8",
  );
  const launchPairingHook = fs.readFileSync(
    path.join(
      rootDir,
      "apps",
      "web",
      "src",
      "lib",
      "engine",
      "useDesktopLaunchPairing.ts",
    ),
    "utf8",
  );
  const enginePairingPanel = fs.readFileSync(
    path.join(
      rootDir,
      "apps",
      "web",
      "src",
      "features",
      "local-engine",
      "EnginePairingPanel.tsx",
    ),
    "utf8",
  );
  const authSource = fs.readFileSync(
    path.join(rootDir, "apps", "web", "src", "pages", "user", "Auth.tsx"),
    "utf8",
  );
  const webRtcSession = fs.readFileSync(
    path.join(rootDir, "apps", "web", "src", "lib", "webrtc", "webrtcSession.ts"),
    "utf8",
  );

  assert.match(desktopController, /createHostedWebLaunchUrl/);
  assert.match(desktopController, /createCompanionLaunchTicket/);
  assert.match(desktopCompanion, /createCompanionLaunchTicket/);
  assert.match(desktopCompanion, /startCompanionServer/);
  assert.match(launchPairingHook, /pairFromDesktopLaunchUrl/);
  assert.match(launchPairing, /engineUrl[\s\S]*engineToken/);
  assert.match(launchPairing, /setEngineToken\(engineToken\)/);
  assert.match(launchPairing, /companionUrl[\s\S]*launchTicket/);
  assert.match(launchPairing, /createCompanionEngineToken\(payload\.companionToken\)/);
  assert.match(launchPairing, /Desktop launch pairing registration v1 failed/);
  assert.match(launchPairing, /pairLocalEngine/);
  assert.match(
    webRtcSession,
    /requestEngineRuntimeSwitch\(requiredRuntimeKind\)[\s\S]*waitForEngineRuntimeKind\(requiredRuntimeKind\)[\s\S]*launchManifestId/,
  );
  assert.match(desktopCompanion, /RUNTIME_SWITCH_PATH/);
  assert.match(desktopCompanion, /onRuntimeSwitch/);
  assert.match(enginePairingPanel, /Engine URL/);
  assert.match(authSource, /Sign In/);
}
