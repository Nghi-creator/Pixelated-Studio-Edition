export type ResearchRunBundleFile = {
  data: string | Uint8Array;
  name: string;
};

function safeBundlePart(value: string) {
  return value
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function toBytes(data: string | Uint8Array) {
  return typeof data === "string" ? new TextEncoder().encode(data) : data;
}

function writeAscii(
  target: Uint8Array,
  offset: number,
  length: number,
  value: string,
) {
  const text = value.slice(0, length);
  for (let index = 0; index < text.length; index += 1) {
    target[offset + index] = text.charCodeAt(index);
  }
}

function writeOctal(
  target: Uint8Array,
  offset: number,
  length: number,
  value: number,
) {
  const octal = value.toString(8).padStart(length - 1, "0").slice(0, length - 1);
  writeAscii(target, offset, length, `${octal}\0`);
}

function createTarHeader(name: string, size: number, mtimeSeconds: number) {
  const header = new Uint8Array(512);

  writeAscii(header, 0, 100, name);
  writeOctal(header, 100, 8, 0o644);
  writeOctal(header, 108, 8, 0);
  writeOctal(header, 116, 8, 0);
  writeOctal(header, 124, 12, size);
  writeOctal(header, 136, 12, mtimeSeconds);
  for (let index = 148; index < 156; index += 1) {
    header[index] = 0x20;
  }
  writeAscii(header, 156, 1, "0");
  writeAscii(header, 257, 6, "ustar");
  writeAscii(header, 263, 2, "00");

  const checksum = header.reduce((total, value) => total + value, 0);
  const checksumText = checksum.toString(8).padStart(6, "0");
  writeAscii(header, 148, 8, `${checksumText}\0 `);

  return header;
}

function paddedLength(length: number) {
  return Math.ceil(length / 512) * 512;
}

export function createResearchRunBundleTar(
  files: ResearchRunBundleFile[],
  mtime = new Date(),
) {
  const mtimeSeconds = Math.floor(mtime.getTime() / 1000);
  const encodedFiles = files.map((file) => ({
    bytes: toBytes(file.data),
    name: file.name.replace(/^\/+/, "").slice(0, 100),
  }));
  const totalLength =
    encodedFiles.reduce(
      (total, file) => total + 512 + paddedLength(file.bytes.length),
      0,
    ) + 1024;
  const archive = new Uint8Array(totalLength);
  let offset = 0;

  encodedFiles.forEach((file) => {
    archive.set(createTarHeader(file.name, file.bytes.length, mtimeSeconds), offset);
    offset += 512;
    archive.set(file.bytes, offset);
    offset += paddedLength(file.bytes.length);
  });

  return archive;
}

export function createResearchRunBundleFilename({
  gameId,
  recordedAt = new Date(),
  runId,
}: {
  gameId: string | undefined;
  recordedAt?: Date;
  runId: string;
}) {
  const safeName = safeBundlePart([gameId || "game", runId].join("-"));
  const timestamp = recordedAt.toISOString().replace(/[:.]/g, "-");

  return `pixelated-research-bundle-${safeName}-${timestamp}.tar`;
}
