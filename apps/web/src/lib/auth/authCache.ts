export type AuthScopedCacheState = {
  favorites: unknown | null;
  permissions: unknown | null;
  session: unknown | null;
};

export type AsyncCacheEntry<T> = {
  expiresAt: number;
  promise: Promise<T>;
  value?: T;
};

export const clearAuthScopedCache = (state: AuthScopedCacheState) => {
  state.favorites = null;
  state.permissions = null;
  state.session = null;
};

export const cacheValueForCurrentEntry = <T>(
  currentEntry: AsyncCacheEntry<T> | null,
  resolvedEntry: AsyncCacheEntry<T>,
  value: T,
) => {
  if (currentEntry === resolvedEntry) {
    resolvedEntry.value = value;
  }

  return value;
};
