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

export function formatGenre(genre: string) {
  return genre
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

