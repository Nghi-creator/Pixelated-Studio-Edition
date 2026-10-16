export function safeSmokeUrl(value) {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  }
  catch {
    return "[invalid URL]";
  }
}
export function redactSmokeText(value, secrets = []) {
  // Navigation failures and console messages can embed signed URLs as plain text.
  let text = String(value).replace(/https?:\/\/[^\s"'<>]+/gi, safeSmokeUrl);
  for (const secret of secrets)
    if (typeof secret === "string" && secret.length >= 8)
      text = text.replaceAll(secret, "[redacted]");
  text = text.replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+\b/g, "[redacted]")
    .replace(/("(?:access_token|refresh_token|sessionToken|companionToken|launchTicket)"\s*:\s*")[^"]*"/gi, '$1[redacted]"')
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+/gi, "Bearer [redacted]");
  return text.length > 4096 ? text.slice(0, 4085) + "[truncated]" : text;
}
export function createSmokeLog({ limit = 1000, secrets = () => [] } = {}) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10000)
    throw new Error("Invalid smoke log limit.");
  const entries = [];
  let dropped = 0;
  return {
    push(value) {
      if (entries.length === limit) {
        dropped++;
        return;
      }
      entries.push(Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
        key === "url" ? redactSmokeText(safeSmokeUrl(item), secrets()) : typeof item === "string" ? redactSmokeText(item, secrets()) : item])));
    },
    filter(predicate) { return entries.filter(predicate); },
    get entries() { return entries; },
    get dropped() { return dropped; },
  };
}
