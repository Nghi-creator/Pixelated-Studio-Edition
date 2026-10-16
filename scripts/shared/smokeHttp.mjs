async function boundedText(response, maximum) {
  const length = response.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > maximum)) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error("Response body exceeds byte limit.");
  }
  if (!response.body)
    return "";
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done)
        break;
      size += value.byteLength;
      if (size > maximum)
        throw new Error("Response body exceeds byte limit.");
      if (value.byteLength)
        chunks.push(value);
    }
    return Buffer.concat(chunks, size).toString("utf8");
  }
  catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  }
  finally {
    reader.releaseLock();
  }
}
// Read the body inside the timeout too: receiving headers is not completion.
export async function requestSmoke(url, options = {}, { timeoutMs = 20000, format = "json", expected, maxBodyBytes = 8 * 1024 * 1024, } = {}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || Math.ceil(timeoutMs) > 2 ** 31 - 1)
    throw new Error("Smoke request timeout must be positive.");
  if (!Number.isSafeInteger(maxBodyBytes) || maxBodyBytes <= 0 || maxBodyBytes > 64 * 1024 * 1024)
    throw new Error("Invalid smoke response byte limit.");
  const endpoint = new URL(url);
  const label = `${options.method || "GET"} ${endpoint.origin}${endpoint.pathname}`;
  const timeout = AbortSignal.timeout(Math.ceil(timeoutMs));
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  let response;
  let text;
  try {
    response = await fetch(url, { ...options, signal });
    text = await boundedText(response, maxBodyBytes);
  }
  catch {
    const reason = timeout.aborted ? "timed out" : signal.aborted ? "was cancelled" : "failed";
    throw new Error(`${label} ${reason} ${response ? `while reading HTTP ${response.status} body` : "before an HTTP response"}.`);
  }
  if (expected !== null && !(expected ? expected.includes(response.status) : response.ok)) {
    throw new Error(`${label} returned HTTP ${response.status}.`);
  }
  if (format === "text")
    return { response, body: text };
  try {
    return { response, body: text ? JSON.parse(text) : null };
  }
  catch {
    // Error pages and auth responses can contain credentials. Do not echo bodies.
    throw new Error(`${label} returned invalid JSON (HTTP ${response.status}).`);
  }
}
