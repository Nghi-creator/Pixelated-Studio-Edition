export function isOwnedAvatarUrl(
  value: string,
  userId: string,
  supabaseUrl: string | undefined,
) {
  if (!supabaseUrl) return false;

  const rawPath = value.split(/[?#]/, 1)[0] || "";
  if (/(?:^|\/)(?:\.{1,2}|%2e(?:%2e)?)(?:\/|$)/i.test(rawPath)) return false;

  try {
    const avatarUrl = new URL(value);
    if (avatarUrl.origin !== new URL(supabaseUrl).origin) return false;

    const match = avatarUrl.pathname.match(
      /^\/storage\/v1\/object\/public\/avatars\/(.+)$/,
    );
    if (!match?.[1]) return false;

    const segments = match[1].split("/").map((segment) => decodeURIComponent(segment));
    return (
      segments.length >= 2 &&
      segments[0] === userId &&
      !segments.some((segment) => !segment || segment === "." || segment === "..")
    );
  } catch {
    return false;
  }
}
