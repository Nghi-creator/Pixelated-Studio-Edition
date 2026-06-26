export type RuntimeKind = "libretro" | "native_linux";

export type RuntimeDefinition = {
  corePath?: string;
  extensions: string[];
  id: string;
  inputProfile: "nes" | "gba" | "snes" | "native_gamepad";
  kind: RuntimeKind;
  launchManifestIds?: string[];
  maxArtifactBytes: number;
};

export const RUNTIME_REGISTRY: Record<string, RuntimeDefinition> = {
  mesen: {
    corePath: "/cores/mesen_libretro.so",
    extensions: [".nes"],
    id: "mesen",
    inputProfile: "nes",
    kind: "libretro",
    maxArtifactBytes: 8 * 1024 * 1024,
  },
  mgba: {
    corePath: "/cores/mgba_libretro.so",
    extensions: [".gb", ".gbc", ".gba"],
    id: "mgba",
    inputProfile: "gba",
    kind: "libretro",
    maxArtifactBytes: 32 * 1024 * 1024,
  },
  bsnes: {
    corePath: "/cores/bsnes_libretro.so",
    extensions: [".sfc", ".smc"],
    id: "bsnes",
    inputProfile: "snes",
    kind: "libretro",
    maxArtifactBytes: 64 * 1024 * 1024,
  },
  "debian-native-v1": {
    extensions: [],
    id: "debian-native-v1",
    inputProfile: "native_gamepad",
    kind: "native_linux",
    launchManifestIds: ["frozen-bubble", "neverball"],
    maxArtifactBytes: 0,
  },
};

export function getRuntimeDefinition(runtimeId: string | null | undefined) {
  if (!runtimeId) return null;
  return RUNTIME_REGISTRY[runtimeId] || null;
}

export function getSupportedExtensions() {
  return Object.values(RUNTIME_REGISTRY)
    .flatMap((runtime) => runtime.extensions)
    .sort();
}

export function getFileExtension(value: string) {
  const pathname = value.startsWith("http")
    ? new URL(value).pathname
    : value;
  const extension = pathname.match(/\.[a-z0-9]+$/i)?.[0]?.toLowerCase();
  return extension || "";
}

export function findRuntimeByExtension(value: string) {
  const extension = getFileExtension(value);
  if (!extension) return null;

  return (
    Object.values(RUNTIME_REGISTRY).find((runtime) =>
      runtime.extensions.includes(extension),
    ) || null
  );
}

export function getRuntimeExtensionForTarget(
  target: string,
  runtime: RuntimeDefinition,
) {
  const extension = getFileExtension(target);
  return runtime.extensions.includes(extension)
    ? extension
    : runtime.extensions[0] || ".rom";
}
