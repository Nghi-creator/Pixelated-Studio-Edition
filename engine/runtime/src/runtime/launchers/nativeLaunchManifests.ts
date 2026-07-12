export type NativeLaunchManifest = {
  args: string[];
  executable: string;
  id: string;
  packageName: string;
  title: string;
};

export const NATIVE_LAUNCH_MANIFESTS: Record<string, NativeLaunchManifest> = {
  "frozen-bubble": {
    args: ["--fullscreen"],
    executable: "/usr/games/frozen-bubble",
    id: "frozen-bubble",
    packageName: "frozen-bubble",
    title: "Frozen-Bubble",
  },
  neverball: {
    args: ["--fullscreen"],
    executable: "/usr/games/neverball",
    id: "neverball",
    packageName: "neverball",
    title: "Neverball",
  },
};

export function getNativeLaunchManifest(manifestId: string | null | undefined) {
  if (!manifestId) return null;
  return NATIVE_LAUNCH_MANIFESTS[manifestId] || null;
}
