export type EngineRuntimeKind = "libretro" | "native_linux";

export function assertEngineRuntimeKindMatches(
  requiredRuntimeKind: EngineRuntimeKind,
  activeRuntimeKind: EngineRuntimeKind,
) {
  if (requiredRuntimeKind === activeRuntimeKind) return;

  throw new Error(
    requiredRuntimeKind === "native_linux"
      ? "This game needs the native Linux engine. Restart Pixelated Desktop with PIXELATED_ENGINE_RUNTIME_KIND=native_linux, then try again."
      : "This game needs the libretro engine. Restart Pixelated Desktop without native runtime mode, then try again.",
  );
}
