import type { spawn } from "child_process";
import type { StreamProfile } from "../../signaling/start-game/startGameHandlers";

type IceServer = {
  credential?: string;
  urls: string | string[];
  username?: string;
};

type LaunchCameraBridgeOptions = {
  cameraPath: string;
  cameraPeerStatePath: string;
  engineToken: string;
  iceServers?: IceServer[];
  sessionId: string;
  spawnProcess: typeof spawn;
  streamProfile?: StreamProfile;
};

export function launchCameraBridge(options: LaunchCameraBridgeOptions) {
  const {
    cameraPath,
    cameraPeerStatePath,
    engineToken,
    iceServers,
    sessionId,
    spawnProcess,
    streamProfile,
  } = options;

  console.log("[Engine] Starting Python WebRTC Camera Bridge...");
  return spawnProcess("python3", ["-u", cameraPath], {
    env: {
      ...process.env,
      PULSE_SERVER: "127.0.0.1",
      PIXELATED_SESSION_ID: sessionId,
      PIXELATED_ENGINE_TOKEN: engineToken,
      PIXELATED_CAMERA_PEER_STATE_PATH: cameraPeerStatePath,
      PIXELATED_ICE_SERVERS: JSON.stringify(iceServers || []),
      PIXELATED_STREAM_PROFILE: JSON.stringify(streamProfile || {}),
    },
  });
}
