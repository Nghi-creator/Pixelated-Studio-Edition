import zlib from "node:zlib";
import { readBoundedFile } from "../../../../infrastructure/boundedRead.js";
export const MAX_ARTWORK_BYTES = 8 * 1024 * 1024;
const crcTable = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit++)
    crc = (crc & 1) ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});
function crc32(bytes: Buffer) {
  let crc = 0xffffffff;
  for (const byte of bytes)
    crc = crcTable[(crc ^ byte) & 255]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function readUInt32(bytes: Buffer, offset: number) {
  return bytes.readUInt32BE(offset);
}
function paethPredictor(left: number, above: number, upperLeft: number) {
  const estimate = left + above - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const aboveDistance = Math.abs(estimate - above);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) {
    return left;
  }
  return aboveDistance <= upperLeftDistance ? above : upperLeft;
}
function assertUsefulPngCapture(bytes: Buffer, filePath: string) {
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idatChunks: Buffer[] = [];
  let ended = false;
  let interlaced = false;
  while (offset + 12 <= bytes.length) {
    const length = readUInt32(bytes, offset);
    const type = bytes.subarray(offset + 4, offset + 8).toString("ascii");
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > bytes.length)
      throw new Error("Truncated PNG chunk.");
    if (crc32(bytes.subarray(offset + 4, dataEnd)) !== readUInt32(bytes, dataEnd))
      throw new Error("Invalid PNG checksum.");
    if (offset === 8 && type !== "IHDR")
      throw new Error("PNG must begin with IHDR.");
    const data = bytes.subarray(dataStart, dataEnd);
    if (type === "IHDR") {
      if (data.length != 13 || width || height)
        throw new Error("Invalid PNG header.");
      width = readUInt32(data, 0);
      height = readUInt32(data, 4);
      bitDepth = data[8] || 0;
      colorType = data[9] || 0;
      interlaced = data[12] === 1;
      if (data[10] !== 0 || data[11] !== 0 || ![0, 1].includes(data[12] ?? -1))
        throw new Error("Invalid PNG methods.");
    }
    else if (type === "IDAT") {
      idatChunks.push(data);
    }
    else if (type === "IEND") {
      if (length !== 0)
        throw new Error("Invalid PNG terminator.");
      ended = true;
      break;
    }
    offset = dataEnd + 4;
  }
  if (!width || !height || width > 8192 || height > 8192 || width * height > 16 * 1024 * 1024 || !ended || !idatChunks.length)
    throw new Error("Invalid or oversized PNG dimensions/layout.");
  const depths: Record<number, number[]> = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
  if (!depths[colorType]?.includes(bitDepth))
    throw new Error("Invalid PNG color depth.");
  if (bitDepth !== 8 || ![2, 6].includes(colorType) || interlaced)
    return;
  const bytesPerPixel = colorType === 6 ? 4 : 3;
  const rowLength = width * bytesPerPixel;
  const expected = (rowLength + 1) * height;
  const inflated = zlib.inflateSync(Buffer.concat(idatChunks), { maxOutputLength: expected });
  if (inflated.length !== expected)
    throw new Error("Invalid PNG scanline length.");
  const previous = Buffer.alloc(rowLength);
  const current = Buffer.alloc(rowLength);
  let nonBlackPixels = 0;
  let sampledPixels = 0;
  let brightnessTotal = 0;
  const colors = new Set<string>();
  let inflatedOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[inflatedOffset];
    inflatedOffset += 1;
    if (filter === undefined || filter > 4)
      throw new Error("Invalid PNG filter.");
    inflated.copy(current, 0, inflatedOffset, inflatedOffset + rowLength);
    inflatedOffset += rowLength;
    for (let x = 0; x < rowLength; x += 1) {
      const left = x >= bytesPerPixel ? current[x - bytesPerPixel] || 0 : 0;
      const above = previous[x] || 0;
      const upperLeft = x >= bytesPerPixel ? previous[x - bytesPerPixel] || 0 : 0;
      if (filter === 1) {
        current[x] = ((current[x] ?? 0) + left) & 0xff;
      }
      else if (filter === 2) {
        current[x] = ((current[x] ?? 0) + above) & 0xff;
      }
      else if (filter === 3) {
        current[x] = ((current[x] ?? 0) + Math.floor((left + above) / 2)) & 0xff;
      }
      else if (filter === 4) {
        current[x] = ((current[x] ?? 0) + paethPredictor(left, above, upperLeft)) & 0xff;
      }
    }
    for (let x = 0; x < rowLength; x += bytesPerPixel * 8) {
      const r = current[x] || 0;
      const g = current[x + 1] || 0;
      const b = current[x + 2] || 0;
      const brightness = (r + g + b) / 3;
      sampledPixels += 1;
      brightnessTotal += brightness;
      if (brightness > 18)
        nonBlackPixels += 1;
      colors.add(`${r >> 4}-${g >> 4}-${b >> 4}`);
    }
    current.copy(previous);
  }
  const nonBlackRatio = sampledPixels > 0 ? nonBlackPixels / sampledPixels : 0;
  const averageBrightness = sampledPixels > 0 ? brightnessTotal / sampledPixels : 0;
  if (nonBlackRatio < 0.005 || colors.size < 2 || averageBrightness < 0.5) {
    throw new Error(`Captured artwork looks blank/invalid (${Math.round(nonBlackRatio * 100)}% non-black, ${colors.size} colors, ${Math.round(averageBrightness)} avg brightness): ${filePath}`);
  }
}
export async function assertReadableImage(filePath: string) {
  const bytes = await readBoundedFile(filePath, MAX_ARTWORK_BYTES);
  if (bytes.length < 16) {
    throw new Error(`Captured artwork is empty: ${filePath}`);
  }
  const isPng = bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isWebp = bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP";
  if (!isPng && !isJpeg && !isWebp) {
    throw new Error(`Captured artwork must be PNG, JPEG, or WebP: ${filePath}`);
  }
  if (isPng)
    assertUsefulPngCapture(bytes, filePath);
  return bytes;
}
export async function readArtworkImage(filePath: string) {
  const bytes = await assertReadableImage(filePath);
  return { bytes, extension: bytes[0] === 0x89 ? ".png" : bytes[0] === 0xff ? ".jpg" : ".webp" };
}
