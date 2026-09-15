export function isSocketPayload(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function socketNumber(value: unknown): number {
  return typeof value === "number" || typeof value === "string" ? Number(value) : NaN;
}
