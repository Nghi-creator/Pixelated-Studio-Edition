import { useEffect, useRef } from "react";
import { useCountPlayMutation } from "./playerMutations";
import { shouldSchedulePlayCount } from "./playCountState";

export function usePlayCount(
  gameId: string | undefined,
  playbackStarted: boolean,
) {
  const eventRef = useRef<{ gameId: string; playEventId: string } | null>(null);
  const { mutate } = useCountPlayMutation({
    onError: (err) => {
      console.error("Failed to count play:", err);
    },
    onSuccess: () => {
      console.log("Play successfully counted!");
    },
  });

  useEffect(() => {
    if (!shouldSchedulePlayCount(gameId, playbackStarted) || !gameId) return;

    if (eventRef.current?.gameId !== gameId) {
      eventRef.current = {
        gameId,
        playEventId: `play_${crypto.randomUUID().replaceAll("-", "")}`,
      };
    }
    const event = eventRef.current;
    if (!event) return;
    const timer = setTimeout(() => mutate(event), 30000);

    return () => clearTimeout(timer);
  }, [gameId, mutate, playbackStarted]);
}
