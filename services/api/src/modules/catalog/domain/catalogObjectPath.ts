export function sanitizeCatalogObjectSegment(
  value: string,
  fallback: "artifact" | "artwork",
) {
  return (
    value
      .trim()
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 120) || fallback
  );
}
