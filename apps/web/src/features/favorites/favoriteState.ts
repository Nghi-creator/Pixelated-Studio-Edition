export type FavoriteSnapshot = {
  error: string;
  ids: ReadonlySet<string>;
  loaded: boolean;
  pendingIds: ReadonlySet<string>;
};

const EMPTY_IDS = new Set<string>();
const listeners = new Set<() => void>();
const mutationOverrides = new Map<string, boolean>();
let loadPromise: Promise<void> | null = null;
let snapshot: FavoriteSnapshot = {
  error: "",
  ids: EMPTY_IDS,
  loaded: false,
  pendingIds: EMPTY_IDS,
};

function emit(nextSnapshot: FavoriteSnapshot) {
  snapshot = nextSnapshot;
  for (const listener of listeners) listener();
}

export function getFavoriteSnapshot() {
  return snapshot;
}

export function subscribeToFavorites(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function resetFavoriteState() {
  loadPromise = null;
  mutationOverrides.clear();
  emit({
    error: "",
    ids: new Set(),
    loaded: false,
    pendingIds: new Set(),
  });
}

export function replaceFavoriteIds(ids: ReadonlySet<string>) {
  mutationOverrides.clear();
  emit({
    ...snapshot,
    error: "",
    ids: new Set(ids),
    loaded: true,
  });
}

export async function ensureFavoritesLoaded(
  load: () => Promise<ReadonlySet<string>>,
) {
  if (snapshot.loaded) return;
  if (loadPromise) return loadPromise;

  loadPromise = load()
    .then((ids) => {
      const reconciledIds = new Set(ids);
      for (const [gameId, favorited] of mutationOverrides) {
        if (favorited) reconciledIds.add(gameId);
        else reconciledIds.delete(gameId);
      }
      emit({
        ...snapshot,
        error: "",
        ids: reconciledIds,
        loaded: true,
      });
    })
    .catch((error) => {
      emit({
        ...snapshot,
        error:
          error instanceof Error
            ? error.message
            : "Could not load favorite games.",
      });
      throw error;
    })
    .finally(() => {
      loadPromise = null;
    });

  return loadPromise;
}

export async function mutateFavorite(
  gameId: string,
  favorited: boolean,
  mutate: () => Promise<unknown>,
) {
  if (snapshot.pendingIds.has(gameId)) return false;

  const pendingIds = new Set(snapshot.pendingIds);
  pendingIds.add(gameId);
  emit({ ...snapshot, error: "", pendingIds });

  try {
    await mutate();
    const ids = new Set(snapshot.ids);
    if (favorited) ids.add(gameId);
    else ids.delete(gameId);
    mutationOverrides.set(gameId, favorited);
    emit({ ...snapshot, error: "", ids, loaded: true });
    return true;
  } catch (error) {
    emit({
      ...snapshot,
      error:
        error instanceof Error
          ? error.message
          : "Could not update favorite. Try again.",
    });
    throw error;
  } finally {
    const nextPendingIds = new Set(snapshot.pendingIds);
    nextPendingIds.delete(gameId);
    emit({ ...snapshot, pendingIds: nextPendingIds });
  }
}
