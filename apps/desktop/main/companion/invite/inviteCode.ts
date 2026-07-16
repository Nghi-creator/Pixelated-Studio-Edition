export function normalizeInviteCode(value: unknown) {
  return typeof value === "string"
    ? value.toUpperCase().replace(/[^A-Z0-9]/g, "")
    : "";
}
