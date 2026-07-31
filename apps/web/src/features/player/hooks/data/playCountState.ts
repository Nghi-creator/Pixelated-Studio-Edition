export function shouldSchedulePlayCount(
  gameId: string | undefined,
  playbackStarted: boolean,
) {
  return Boolean(gameId && playbackStarted);
}
