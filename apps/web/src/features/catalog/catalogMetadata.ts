export const CATALOG_GENRES = [
  "action",
  "adventure",
  "arcade",
  "platformer",
  "puzzle",
  "racing",
  "role-playing",
  "shooter",
  "simulation",
  "sports",
  "strategy",
  "other",
] as const;

export type CatalogGenre = (typeof CATALOG_GENRES)[number];

export const CATALOG_PLATFORM_OPTIONS = [
  { id: "nes", label: "NES" },
  { id: "gb", label: "Game Boy" },
  { id: "gbc", label: "Game Boy Color" },
  { id: "gba", label: "Game Boy Advance" },
  { id: "snes", label: "Super Nintendo" },
  { id: "genesis", label: "Genesis / Mega Drive" },
  { id: "sms", label: "Master System" },
  { id: "game_gear", label: "Game Gear" },
  { id: "linux", label: "Linux" },
] as const;

export function formatGenre(genre: string) {
  return genre
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
