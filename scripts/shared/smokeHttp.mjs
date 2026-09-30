// Read the body inside the timeout too: receiving headers is not completion.
export async function requestSmoke(url, options = {}, {
  timeoutMs = 20_000, format = "json", expected,
} = {}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error("Smoke request timeout must be positive.");
  const endpoint = new URL(url);
  const label = `${options.method || "GET"} ${endpoint.origin}${endpoint.pathname}`;
  const timeout = AbortSignal.timeout(Math.ceil(timeoutMs));
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  let response;
  let text;
  try {
    response = await fetch(url, { ...options, signal });
    text = await response.text();
  } catch {
    const reason = timeout.aborted ? "timed out" : signal.aborted ? "was cancelled" : "failed";
    throw new Error(`${label} ${reason} ${response ? `while reading HTTP ${response.status} body` : "before an HTTP response"}.`);
  }
  if (expected !== null && !(expected ? expected.includes(response.status) : response.ok)) {
    throw new Error(`${label} returned HTTP ${response.status}.`);
  }
  if (format === "text") return { response, body: text };
  try {
    return { response, body: text ? JSON.parse(text) : null };
  } catch {
    // Error pages and auth responses can contain credentials. Do not echo bodies.
    throw new Error(`${label} returned invalid JSON (HTTP ${response.status}).`);
  }
}
