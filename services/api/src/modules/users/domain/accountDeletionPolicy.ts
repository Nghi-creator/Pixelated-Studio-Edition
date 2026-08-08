export const ACCOUNT_DELETE_RECENT_SIGN_IN_MS = 10 * 60 * 1000;

export function canSelfDeleteAccount(role: string | null | undefined) {
  return role !== "admin" && role !== "super_admin";
}

export function hasRecentSignIn(
  lastSignInAt: string | undefined,
  now = Date.now(),
) {
  if (!lastSignInAt) return false;

  const signedInAt = Date.parse(lastSignInAt);
  return (
    Number.isFinite(signedInAt) &&
    now - signedInAt <= ACCOUNT_DELETE_RECENT_SIGN_IN_MS
  );
}
