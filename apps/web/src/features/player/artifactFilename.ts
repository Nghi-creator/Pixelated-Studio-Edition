export function sanitizeArtifactFilenamePart(value: string) {
  return value
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function createPlayerArtifactFilename({
  extension,
  identity,
  prefix,
  recordedAt,
}: {
  extension: string;
  identity: string[];
  prefix: string;
  recordedAt: Date;
}) {
  const safeName = sanitizeArtifactFilenamePart(identity.join("-"));
  const timestamp = recordedAt.toISOString().replace(/[:.]/g, "-");
  return `${prefix}-${safeName}-${timestamp}.${extension}`;
}
