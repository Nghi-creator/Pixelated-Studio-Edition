import { constants } from "node:fs";
import fs from "node:fs/promises";
function assertLimit(maxBytes: number) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0)
    throw new Error("Invalid byte limit.");
}
export async function readBoundedResponse(response: Response, maxBytes: number): Promise<Buffer> {
  assertLimit(maxBytes);
  const declared = response.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > maxBytes)) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error("Response exceeds byte limit or has an invalid length.");
  }
  if (!response.body)
    return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done)
        break;
      size += value.byteLength;
      if (size > maxBytes)
        throw new Error("Response exceeds byte limit.");
      if (value.byteLength)
        chunks.push(value);
    }
    return Buffer.concat(chunks, size);
  }
  catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  }
  finally {
    reader.releaseLock();
  }
}
export async function readBoundedFile(filePath: string, maxBytes: number): Promise<Buffer> {
  assertLimit(maxBytes);
  const file = await fs.open(filePath, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size > maxBytes)
      throw new Error("Expected a bounded regular file.");
    const bytes = Buffer.alloc(maxBytes + 1);
    let size = 0;
    while (size < bytes.length) {
      const result = await file.read(bytes, size, bytes.length - size, null);
      if (result.bytesRead === 0)
        break;
      size += result.bytesRead;
    }
    if (size > maxBytes)
      throw new Error("File exceeds byte limit.");
    return bytes.subarray(0, size);
  }
  finally {
    await file.close();
  }
}
export function withRequestDeadline(fetchImpl: typeof fetch, timeoutMs: number): typeof fetch {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 600000)
    throw new Error("Invalid request deadline.");
  return (input, options = {}) => fetchImpl(input, { ...options,
    signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs),
  });
}
