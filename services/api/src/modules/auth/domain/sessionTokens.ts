import crypto from "node:crypto";

export function createSessionToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function createSessionId(clientSessionId?: string) {
  return clientSessionId || crypto.randomUUID();
}

export function hashSessionToken(sessionToken: string) {
  return crypto.createHash("sha256").update(sessionToken).digest("hex");
}

export function sessionTokenMatches(storedHash: string, sessionToken: string) {
  const candidateHash = hashSessionToken(sessionToken);
  const stored = Buffer.from(storedHash, "hex");
  const candidate = Buffer.from(candidateHash, "hex");

  return (
    stored.length === candidate.length && crypto.timingSafeEqual(stored, candidate)
  );
}
