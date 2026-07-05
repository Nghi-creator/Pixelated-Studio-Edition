import { useEffect, useRef } from "react";
import type { StreamProfile } from "../engine/streamProfiles";
import { createWebRTCProfileRestartIdentity } from "./webrtcIdentity";

export function useWebRTCProfileRestart({
  peerIdRef,
  setRetryVersion,
  streamProfile,
}: {
  peerIdRef: { current: string };
  setRetryVersion: (updater: (currentVersion: number) => number) => void;
  streamProfile: StreamProfile;
}) {
  const streamProfileRef = useRef(streamProfile);
  const appliedStreamProfileIdRef = useRef(streamProfile.id);
  const seamlessRestartRef = useRef(false);
  const profileAutoRetriesRemainingRef = useRef(0);

  useEffect(() => {
    streamProfileRef.current = streamProfile;
    if (appliedStreamProfileIdRef.current === streamProfile.id) return;

    appliedStreamProfileIdRef.current = streamProfile.id;
    const identity = createWebRTCProfileRestartIdentity();
    peerIdRef.current = identity.peerId;
    seamlessRestartRef.current = true;
    profileAutoRetriesRemainingRef.current = 1;
    setRetryVersion((currentVersion) => currentVersion + 1);
  }, [peerIdRef, setRetryVersion, streamProfile]);

  return {
    profileAutoRetriesRemainingRef,
    seamlessRestartRef,
    streamProfileRef,
  };
}
