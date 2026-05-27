export type StreamProfileId = "balanced" | "performance" | "quality";

export type StreamProfile = {
  bitrateKbps: number;
  fps: number;
  id: StreamProfileId;
  label: string;
};

export const STREAM_PROFILE_STORAGE_KEY = "pixelated_stream_profile";

export const STREAM_PROFILES: StreamProfile[] = [
  {
    bitrateKbps: 700,
    fps: 30,
    id: "performance",
    label: "Performance",
  },
  {
    bitrateKbps: 1000,
    fps: 60,
    id: "balanced",
    label: "Balanced",
  },
  {
    bitrateKbps: 1600,
    fps: 60,
    id: "quality",
    label: "Quality",
  },
];

export const DEFAULT_STREAM_PROFILE =
  STREAM_PROFILES.find((profile) => profile.id === "balanced") ||
  STREAM_PROFILES[0];

export function getStreamProfile(profileId: string | null | undefined) {
  return (
    STREAM_PROFILES.find((profile) => profile.id === profileId) ||
    DEFAULT_STREAM_PROFILE
  );
}
