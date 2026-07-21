import crypto from "node:crypto";
import { assertCandidateArtifactHeader } from "./catalogCandidateValidation.js";
import type { CandidateRow, SupabaseServiceLike } from "./catalogCandidateTypes.js";
import { sanitizeCatalogObjectSegment } from "../domain/catalogObjectPath.js";
import { createSignedSubmissionUrl } from "../domain/submissionStorage.js";

const ALLOWED_ARTIFACT_HOSTS = new Set(["raw.githubusercontent.com"]);

const sanitizeObjectSegment = (value: string) =>
  sanitizeCatalogObjectSegment(value, "artifact");

function sha256(bytes: Buffer) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

async function readExactArtifactBytes(response: Response, expectedSize: number) {
  const contentLengthHeader = response.headers.get("content-length");
  const contentLength = Number(contentLengthHeader);
  if (
    contentLengthHeader !== null &&
    Number.isFinite(contentLength) &&
    contentLength >= 0 &&
    contentLength !== expectedSize
  ) {
    throw new Error(
      `Candidate artifact size mismatch. Expected ${expectedSize}, received ${contentLength}.`,
    );
  }

  if (!response.body) {
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length !== expectedSize) {
      throw new Error(
        `Candidate artifact size mismatch. Expected ${expectedSize}, received ${bytes.length}.`,
      );
    }
    return bytes;
  }

  const reader = response.body.getReader();
  const bytes = Buffer.allocUnsafe(expectedSize);
  let offset = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (offset + value.byteLength > expectedSize) {
      await reader.cancel();
      throw new Error(
        `Candidate artifact size mismatch. Expected ${expectedSize}, received more data.`,
      );
    }
    bytes.set(value, offset);
    offset += value.byteLength;
  }
  if (offset !== expectedSize) {
    throw new Error(
      `Candidate artifact size mismatch. Expected ${expectedSize}, received ${offset}.`,
    );
  }
  return bytes;
}

function candidateArtifactRoot(candidate: CandidateRow) {
  if (candidate.source_kind === "curated_licensed_rom") return "curated-roms";
  if (candidate.source_kind === "debian_main_games") return "debian-main";
  return "homebrew-hub";
}

function assertAllowedArtifactUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Candidate artifact URL is invalid.");
  }

  if (url.protocol !== "https:" || !ALLOWED_ARTIFACT_HOSTS.has(url.hostname)) {
    throw new Error("Candidate artifact URL host is not allowed.");
  }
}

export async function fetchVerifiedCandidateArtifact(
  candidate: CandidateRow,
  fetchArtifact: typeof fetch,
  service?: SupabaseServiceLike,
) {
  if (
    !candidate.artifact_url ||
    !candidate.artifact_filename ||
    !candidate.artifact_size ||
    !candidate.artifact_sha256
  ) {
    throw new Error("Candidate is missing artifact metadata.");
  }
  if (!Number.isSafeInteger(candidate.artifact_size)) {
    throw new Error("Candidate artifact size is invalid.");
  }

  let artifactUrl = candidate.artifact_url;
  if (candidate.source_kind === "user_submission") {
    if (!service) {
      throw new Error("Submission artifact signing is not configured.");
    }
    const signedArtifactUrl = await createSignedSubmissionUrl(service, artifactUrl);
    if (!signedArtifactUrl) {
      throw new Error("Candidate submission artifact is unavailable.");
    }
    artifactUrl = signedArtifactUrl;
  } else {
    assertAllowedArtifactUrl(artifactUrl);
  }
  const response = await fetchArtifact(artifactUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch candidate artifact: ${response.status}`);
  }

  const bytes = await readExactArtifactBytes(response, candidate.artifact_size);

  const actualSha256 = sha256(bytes);
  if (actualSha256 !== candidate.artifact_sha256) {
    throw new Error("Candidate artifact checksum mismatch.");
  }
  assertCandidateArtifactHeader(candidate, bytes);

  return bytes;
}

export async function mirrorCandidateArtifact(
  service: SupabaseServiceLike,
  candidate: CandidateRow,
  fetchArtifact: typeof fetch,
) {
  const bytes = await fetchVerifiedCandidateArtifact(candidate, fetchArtifact, service);

  if (!candidate.artifact_filename || !candidate.artifact_sha256) {
    throw new Error("Candidate is missing artifact metadata.");
  }

  const objectPath = [
    candidateArtifactRoot(candidate),
    sanitizeObjectSegment(candidate.source_commit),
    sanitizeObjectSegment(candidate.platform_id),
    `${candidate.artifact_sha256}-${sanitizeObjectSegment(candidate.artifact_filename)}`,
  ].join("/");

  const bucket = service.storage.from("catalog_roms");
  const { error: uploadError } = await bucket.upload(objectPath, bytes, {
    contentType: "application/octet-stream",
    upsert: true,
  });
  if (uploadError) throw uploadError;

  const { data } = bucket.getPublicUrl(objectPath);
  if (!data.publicUrl) {
    throw new Error("Failed to resolve mirrored artifact storage URL.");
  }

  return {
    bytes,
    objectPath,
    publicUrl: data.publicUrl,
  };
}

function escapeSvgText(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export async function createGeneratedCover(
  service: SupabaseServiceLike,
  candidate: CandidateRow,
) {
  const platform = candidate.platform_id.toUpperCase();
  const title = escapeSvgText(candidate.title);
  const license = escapeSvgText(candidate.code_license_spdx);
  const subtitle =
    candidate.runtime_kind === "native_linux"
      ? "Reviewed Debian native package"
      : "Reviewed homebrew build";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540" role="img" aria-labelledby="title desc">
  <title id="title">${title}</title>
  <desc id="desc">Generated Pixelated catalog cover for ${title}</desc>
  <defs>
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="#2a111d"/>
      <stop offset="45%" stop-color="#5a263b"/>
      <stop offset="100%" stop-color="#d79aae"/>
    </linearGradient>
  </defs>
  <rect width="960" height="540" fill="url(#bg)"/>
  <rect x="48" y="48" width="864" height="444" rx="38" fill="rgba(42,17,29,0.62)" stroke="#e6abc0" stroke-width="4"/>
  <text x="92" y="150" fill="#f9eef3" font-family="Inter, Arial, sans-serif" font-size="34" font-weight="700" letter-spacing="4">${platform}</text>
  <text x="92" y="276" fill="#ffffff" font-family="Inter, Arial, sans-serif" font-size="72" font-weight="800">${title}</text>
  <text x="92" y="366" fill="#f1c9d7" font-family="Inter, Arial, sans-serif" font-size="30">${subtitle}</text>
  <text x="92" y="424" fill="#e6abc0" font-family="Inter, Arial, sans-serif" font-size="24">License: ${license}</text>
  <circle cx="814" cy="138" r="44" fill="#e6abc0" opacity="0.9"/>
  <circle cx="864" cy="190" r="28" fill="#ffffff" opacity="0.72"/>
</svg>`;

  const objectPath = [
    "covers",
    sanitizeObjectSegment(candidate.source_commit),
    sanitizeObjectSegment(candidate.platform_id),
    `${sanitizeObjectSegment(
      candidate.artifact_sha256 ||
        candidate.launch_manifest_id ||
        candidate.id,
    )}.svg`,
  ].join("/");

  const bucket = service.storage.from("catalog_artifacts");
  const { error: uploadError } = await bucket.upload(
    objectPath,
    Buffer.from(svg),
    {
      contentType: "image/svg+xml",
      upsert: true,
    },
  );
  if (uploadError) throw uploadError;

  const { data } = bucket.getPublicUrl(objectPath);
  if (!data.publicUrl) {
    throw new Error("Failed to resolve generated cover public URL.");
  }

  return {
    objectPath,
    publicUrl: data.publicUrl,
  };
}
