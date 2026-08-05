export const LOCAL_VAULT_EXTENSIONS = [
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
];
export const MAX_LOCAL_ROM_BYTES = 64 * 1024 * 1024;
export const INVALID_ENGINE_TOKEN_MESSAGE =
  "The saved pairing token was rejected. Enter the current desktop token to reconnect.";
export const LOCAL_ENGINE_UNREACHABLE_MESSAGE =
  "Local engine is unreachable. Check the desktop app and engine URL.";

export type LocalVaultGame = {
  id: string;
  title: string;
};

export class InvalidEngineTokenError extends Error {
  constructor() {
    super(INVALID_ENGINE_TOKEN_MESSAGE);
    this.name = "InvalidEngineTokenError";
  }
}

export function validateLocalRomFile(file: Pick<File, "name" | "size"> | null) {
  if (!file) return "Choose a supported ROM file first.";
  const lowerFilename = file.name.toLowerCase();
  if (!LOCAL_VAULT_EXTENSIONS.some((extension) => lowerFilename.endsWith(extension))) {
    return "Only .nes, .gb, .gbc, .gba, .sfc, .smc, .md, .gen, .sms, and .gg files are supported.";
  }
  if (file.size > MAX_LOCAL_ROM_BYTES) {
    return "ROM files must be 64 MB or smaller.";
  }
  return null;
}

export function getLocalGameTitle(filename: string) {
  return filename.replace(/\.(nes|gb|gbc|gba|sfc|smc|md|gen|sms|gg)$/i, "");
}

export function getLocalGamePlayPath(filename: string) {
  return `/play/${encodeURIComponent(filename)}`;
}

export function normalizeLocalGameFilenames(payload: unknown) {
  if (!Array.isArray(payload)) return [];

  return payload
    .filter((filename): filename is string => typeof filename === "string")
    .filter((filename) => {
      const lowerFilename = filename.toLowerCase();
      return LOCAL_VAULT_EXTENSIONS.some((extension) =>
        lowerFilename.endsWith(extension),
      );
    });
}

export function toLocalVaultGames(filenames: string[]): LocalVaultGame[] {
  return filenames.map((filename) => ({
    id: filename,
    title: getLocalGameTitle(filename),
  }));
}

export function getLocalVaultErrorMessage(error: unknown, fallback: string) {
  if (error instanceof InvalidEngineTokenError) return error.message;
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

export function isInvalidEngineTokenError(
  error: unknown,
): error is InvalidEngineTokenError {
  return error instanceof InvalidEngineTokenError;
}
