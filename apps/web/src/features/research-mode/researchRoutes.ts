export type PlayerExperience = "normal" | "research";

export function getGameDestination(
  gameId: string,
  experience: PlayerExperience = "normal",
) {
  return experience === "research"
    ? `/research/games/${gameId}/setup`
    : `/play/${gameId}`;
}

