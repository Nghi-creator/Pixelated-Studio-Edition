import type { Dispatch, SetStateAction } from "react";
import type { StreamProfile } from "../engine/streamProfiles";
import type { WebRTCStatus } from "./webrtcSession";
import type { EngineSocket } from "./webrtcSocket";
import type { WebRTCTelemetry } from "./webrtcTelemetry";
import type {
  EngineInputCapabilities,
  EngineShareContext,
  LobbyParticipant,
  LobbyState,
  UseWebRTCOptions,
} from "./types";
import type { resolveGameBootTarget } from "./webrtcSession";

export type RefValue<T> = { current: T };

export type BootTarget = Awaited<ReturnType<typeof resolveGameBootTarget>>;

export type WebRTCSessionConfig = {
  activeStreamProfile: StreamProfile;
  displayName: string;
  mode: "host" | "guest";
  peerId: string;
  requestedRole: string;
  seamlessRestart: boolean;
};

export type WebRTCSessionRuntime = {
  activeConnectGeneration: number;
  automaticRecoveryQueued: boolean;
  bootReadyTimeoutId: number | null;
  bootTargetPromise: Promise<BootTarget> | null;
  detachEngineInput: () => void;
  disconnectedTimeoutId: number | null;
  disposed: boolean;
  heartbeatIntervalId: number | null;
  iceServersForSession: RTCIceServer[];
  incomingStream: MediaStream | null;
  offerSent: boolean;
  pc: RTCPeerConnection | null;
  resolvedBootTarget: BootTarget | null;
  socket: EngineSocket;
  stopTelemetry: () => void;
};

export type FailStream = (message: string) => void;

export type UseWebRTCSessionLifecycleParams = {
  gameId: string;
  inputCapabilitiesRef: RefValue<EngineInputCapabilities>;
  lastMetricSentAtRef: RefValue<number>;
  localParticipantRef: RefValue<LobbyParticipant | null>;
  metricsDisabledRef: RefValue<boolean>;
  onResearchEvent: UseWebRTCOptions["onResearchEvent"];
  options: UseWebRTCOptions;
  pairingVersion: number;
  pcRef: RefValue<RTCPeerConnection | null>;
  peerIdRef: RefValue<string>;
  profileAutoRetriesRemainingRef: RefValue<number>;
  retryVersion: number;
  seamlessRestartRef: RefValue<boolean>;
  sessionConflictAutoRetriesRemainingRef: RefValue<number>;
  sessionId: string;
  setInputCapabilities: Dispatch<SetStateAction<EngineInputCapabilities>>;
  setLobbyState: Dispatch<SetStateAction<LobbyState | null>>;
  setLocalParticipant: Dispatch<SetStateAction<LobbyParticipant | null>>;
  setRetryVersion: Dispatch<SetStateAction<number>>;
  setSessionId: Dispatch<SetStateAction<string>>;
  setShareContext: Dispatch<SetStateAction<EngineShareContext>>;
  setStatus: Dispatch<SetStateAction<WebRTCStatus>>;
  setStream: Dispatch<SetStateAction<MediaStream | null>>;
  setTelemetry: Dispatch<SetStateAction<WebRTCTelemetry>>;
  shareContextRef: RefValue<EngineShareContext>;
  socketRef: RefValue<EngineSocket | null>;
  streamProfileRef: RefValue<StreamProfile>;
};
