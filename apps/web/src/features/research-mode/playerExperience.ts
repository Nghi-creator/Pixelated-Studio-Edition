import type { PlayerExperience } from "./researchRoutes";

export type PlayerExperiencePolicy = {
  allowAudioControls: boolean;
  allowFullscreen: boolean;
  allowKeyboardMapping: boolean;
  allowLobbyAndSharing: boolean;
  recordPlayCount: boolean;
  showCommunity: boolean;
  showStreamTelemetryControls: boolean;
};

const NORMAL_PLAYER_POLICY = Object.freeze({
  allowAudioControls: true,
  allowFullscreen: true,
  allowKeyboardMapping: true,
  allowLobbyAndSharing: true,
  recordPlayCount: true,
  showCommunity: true,
  showStreamTelemetryControls: true,
}) satisfies PlayerExperiencePolicy;

const RESEARCH_PLAYER_POLICY = Object.freeze({
  allowAudioControls: true,
  allowFullscreen: true,
  allowKeyboardMapping: true,
  allowLobbyAndSharing: false,
  recordPlayCount: false,
  showCommunity: false,
  showStreamTelemetryControls: true,
}) satisfies PlayerExperiencePolicy;

export function getPlayerExperiencePolicy(
  experience: PlayerExperience,
): PlayerExperiencePolicy {
  return experience === "research"
    ? RESEARCH_PLAYER_POLICY
    : NORMAL_PLAYER_POLICY;
}

