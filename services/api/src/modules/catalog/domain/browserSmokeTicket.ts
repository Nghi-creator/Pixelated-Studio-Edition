import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const ticketPayloadSchema = z.object({
  artifactSha256: z.string().regex(/^[a-f0-9]{64}$/),
  candidateId: z.string().uuid(),
  coreId: z.literal("fceumm"),
  expiresAt: z.number().int().positive(),
  issuedAt: z.number().int().positive(),
  nonce: z.string().min(16).max(128),
  reviewerId: z.string().uuid(),
});

export type BrowserSmokeTicketPayload = z.infer<typeof ticketPayloadSchema>;

function sign(encodedPayload: string, secret: string) {
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

export function createBrowserSmokeTicket(
  input: Omit<BrowserSmokeTicketPayload, "expiresAt" | "issuedAt" | "nonce">,
  secret: string,
  ttlSeconds: number,
  now = Date.now(),
) {
  const payload: BrowserSmokeTicketPayload = {
    ...input,
    expiresAt: now + ttlSeconds * 1000,
    issuedAt: now,
    nonce: randomBytes(18).toString("base64url"),
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return {
    expiresAt: new Date(payload.expiresAt).toISOString(),
    ticket: `${encodedPayload}.${sign(encodedPayload, secret)}`,
  };
}

export function verifyBrowserSmokeTicket(
  ticket: string,
  secret: string,
  now = Date.now(),
) {
  const [encodedPayload, signature, extra] = ticket.split(".");
  if (!encodedPayload || !signature || extra) throw new Error("Invalid smoke ticket");

  const expected = Buffer.from(sign(encodedPayload, secret));
  const actual = Buffer.from(signature);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new Error("Invalid smoke ticket");
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  } catch {
    throw new Error("Invalid smoke ticket");
  }
  const payload = ticketPayloadSchema.parse(decoded);
  if (payload.expiresAt <= now) throw new Error("Smoke ticket expired");
  return payload;
}
