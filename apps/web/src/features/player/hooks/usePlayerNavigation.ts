import { useMemo } from "react";
import type { Location } from "react-router-dom";

type PlayerBackState = {
  backRoute?: unknown;
  backText?: unknown;
};

const isPlayerBackState = (state: unknown): state is PlayerBackState =>
  typeof state === "object" && state !== null;

export function usePlayerNavigation(location: Location, gameId?: string) {
  const isLocalGame = /\.(nes|gb|gbc|gba|sfc|smc|md|gen|sms|gg)$/i.test(
    gameId || "",
  );
  const fallbackBackRoute = isLocalGame ? "/local" : "/home";
  const fallbackBackText = isLocalGame
    ? "Back to Local Vault"
    : "Back to Cloud Library";
  const backState = isPlayerBackState(location.state) ? location.state : null;

  return {
    backRoute:
      typeof backState?.backRoute === "string"
        ? backState.backRoute
        : fallbackBackRoute,
    backText:
      typeof backState?.backText === "string"
        ? backState.backText
        : fallbackBackText,
    lobbySearch: useMemo(
      () => new URLSearchParams(location.search),
      [location.search],
    ),
  };
}
