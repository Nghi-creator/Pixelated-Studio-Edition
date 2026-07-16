export const SUPPORTED_SUBMISSION_ROM_EXTENSIONS = [
  ".nes",
  ".gb",
  ".gbc",
  ".gba",
  ".sfc",
  ".smc",
  ".md",
  ".gen",
  ".sms",
  ".gg",
] as const;

export const SUPPORTED_SUBMISSION_ROM_LABEL =
  ".nes, .gb, .gbc, .gba, .sfc, .smc, .md, .gen, .sms, or .gg";

export function getSupportedSubmissionRomExtension(value: string) {
  const normalized = value.toLowerCase();
  return (
    SUPPORTED_SUBMISSION_ROM_EXTENSIONS.find((extension) =>
      normalized.endsWith(extension),
    ) || null
  );
}

export function getSubmissionRomPlatform(value: string) {
  const extension = getSupportedSubmissionRomExtension(value);
  if (extension === ".nes") {
    return { platformId: "nes", runtimeId: "mesen" };
  }
  if (extension === ".gb") {
    return { platformId: "gb", runtimeId: "mgba" };
  }
  if (extension === ".gbc") {
    return { platformId: "gbc", runtimeId: "mgba" };
  }
  if (extension === ".gba") {
    return { platformId: "gba", runtimeId: "mgba" };
  }
  if (extension === ".sfc" || extension === ".smc") {
    return { platformId: "snes", runtimeId: "bsnes" };
  }
  if (extension === ".md" || extension === ".gen") {
    return { platformId: "genesis", runtimeId: "picodrive" };
  }
  if (extension === ".sms") {
    return { platformId: "sms", runtimeId: "picodrive" };
  }
  if (extension === ".gg") {
    return { platformId: "game_gear", runtimeId: "picodrive" };
  }
  return null;
}
