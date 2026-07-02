import crypto from "node:crypto";
import path from "node:path";
import { assertCandidateArtifactHeader } from "./catalogCandidateValidation.js";

export type CuratedRomManifestStubOptions = {
  artifactFilename?: string;
  artifactUrl: string;
  assetLicenseSpdx?: string;
  attributionText?: string;
  codeLicenseSpdx: string;
  developerName?: string;
  developerUrl?: string;
  licenseUrl: string;
  nonCommercialHostingAllowed?: boolean;
  manifestPath: string;
  originalReleaseUrl?: string;
  permissionEvidenceUrl?: string;
  rawBaseUrl?: string;
  repoUrl?: string;
  rightsWarnings?: string[];
  slug?: string;
  sourceCommit?: string;
  sourceEntryPath?: string;
  title: string;
};

export type CuratedRomManifestStub = {
  entries: [
    {
      artifactFilename: string;
      artifactSha256: string;
      artifactSize: number;
      artifactUrl?: string;
      assetLicenseSpdx?: string;
      attributionText: string;
      codeLicenseSpdx: string;
      developerName?: string;
      developerUrl?: string;
      licenseUrl: string;
      nonCommercialHostingAllowed: true;
      originalReleaseUrl?: string;
      permissionEvidenceUrl?: string;
      rightsWarnings: string[];
      slug: string;
      sourceEntryPath: string;
      title: string;
    },
  ];
  manifestPath: string;
  rawBaseUrl: string;
  repoUrl: string;
  sourceCommit: string;
};

type PinnedRawArtifact = {
  rawBaseUrl: string;
  repoUrl: string;
  sourceCommit: string;
  sourceEntryPath: string;
};

const SUPPORTED_ARTIFACT_EXTENSIONS = new Set([
  ".nes",
  ".gb",
  ".gbc",
  ".gba",
  ".sfc",
  ".smc",
  ".md",
  ".gen",
  ".sms",
  ".gg",
]);

function trim(value: string | undefined) {
  return value?.trim() || "";
}

function assertHttpsUrl(value: string, label: string) {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid URL.`);
  }
  if (parsed.protocol !== "https:") {
    throw new Error(`${label} must use HTTPS.`);
  }
  return parsed;
}

function optionalHttpsUrl(value: string | undefined, label: string) {
  const text = trim(value);
  if (!text) return undefined;
  assertHttpsUrl(text, label);
  return text;
}

function getArtifactFilename(artifactUrl: string, artifactFilename?: string) {
  const explicitFilename = trim(artifactFilename);
  if (explicitFilename) return explicitFilename;

  const parsed = assertHttpsUrl(artifactUrl, "artifactUrl");
  const pathname = decodeURIComponent(parsed.pathname);
  const basename = path.posix.basename(pathname);
  if (!basename || basename === "/" || basename === ".") {
    throw new Error("artifactFilename is required when artifactUrl has no filename.");
  }
  return basename;
}

function assertSupportedArtifactFilename(artifactFilename: string) {
  const extension = path.extname(artifactFilename).toLowerCase();
  if (!SUPPORTED_ARTIFACT_EXTENSIONS.has(extension)) {
    throw new Error(
      `Unsupported artifact extension ${extension || "(none)"}. Supported extensions: ${[
        ...SUPPORTED_ARTIFACT_EXTENSIONS,
      ].join(", ")}.`,
    );
  }
}

function assertSourceCommit(sourceCommit: string) {
  if (!/^[a-f0-9]{40}$/.test(sourceCommit)) {
    throw new Error("sourceCommit must be a 40-character lowercase Git SHA-1.");
  }
}

function slugify(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "curated-rom";
}

export function inferPinnedGitHubRawArtifact(
  artifactUrl: string,
): PinnedRawArtifact | null {
  const parsed = assertHttpsUrl(artifactUrl, "artifactUrl");
  const rawMatch = parsed.pathname.match(
    /^\/([^/]+)\/([^/]+)\/([a-fA-F0-9]{40})\/(.+)$/,
  );
  if (parsed.hostname === "raw.githubusercontent.com" && rawMatch) {
    const owner = rawMatch[1];
    const repo = rawMatch[2];
    const sourceCommit = rawMatch[3];
    const sourceEntryPath = rawMatch[4];
    if (!owner || !repo || !sourceCommit || !sourceEntryPath) return null;
    return {
      rawBaseUrl: `https://raw.githubusercontent.com/${owner}/${repo}`,
      repoUrl: `https://github.com/${owner}/${repo}`,
      sourceCommit: sourceCommit.toLowerCase(),
      sourceEntryPath,
    };
  }

  const blobMatch = parsed.pathname.match(
    /^\/([^/]+)\/([^/]+)\/blob\/([a-fA-F0-9]{40})\/(.+)$/,
  );
  if (parsed.hostname === "github.com" && blobMatch) {
    const owner = blobMatch[1];
    const repo = blobMatch[2];
    const sourceCommit = blobMatch[3];
    const sourceEntryPath = blobMatch[4];
    if (!owner || !repo || !sourceCommit || !sourceEntryPath) return null;
    return {
      rawBaseUrl: `https://raw.githubusercontent.com/${owner}/${repo}`,
      repoUrl: `https://github.com/${owner}/${repo}`,
      sourceCommit: sourceCommit.toLowerCase(),
      sourceEntryPath,
    };
  }

  return null;
}

function resolvedSourceMetadata(options: CuratedRomManifestStubOptions) {
  const inferred = inferPinnedGitHubRawArtifact(options.artifactUrl);
  const repoUrl = trim(options.repoUrl) || inferred?.repoUrl || "";
  const rawBaseUrl = trim(options.rawBaseUrl) || inferred?.rawBaseUrl || "";
  const sourceCommit =
    trim(options.sourceCommit).toLowerCase() || inferred?.sourceCommit || "";
  const sourceEntryPath =
    trim(options.sourceEntryPath) || inferred?.sourceEntryPath || "";

  if (!repoUrl) {
    throw new Error(
      "repoUrl is required unless artifactUrl is a pinned GitHub raw/blob URL.",
    );
  }
  if (!rawBaseUrl) {
    throw new Error(
      "rawBaseUrl is required unless artifactUrl is a pinned GitHub raw/blob URL.",
    );
  }
  if (!sourceCommit) {
    throw new Error(
      "sourceCommit is required unless artifactUrl is a pinned GitHub raw/blob URL.",
    );
  }
  if (!sourceEntryPath) {
    throw new Error(
      "sourceEntryPath is required unless artifactUrl is a pinned GitHub raw/blob URL.",
    );
  }

  assertHttpsUrl(repoUrl, "repoUrl");
  assertHttpsUrl(rawBaseUrl, "rawBaseUrl");
  assertSourceCommit(sourceCommit);

  return { repoUrl, rawBaseUrl, sourceCommit, sourceEntryPath };
}

function artifactUrlFor(
  rawBaseUrl: string,
  sourceCommit: string,
  sourceEntryPath: string,
) {
  return `${rawBaseUrl.replace(/\/$/, "")}/${sourceCommit}/${sourceEntryPath.replace(/^\/+/, "")}`;
}

function sha256(bytes: Buffer) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

export function createCuratedRomManifestStub(
  options: CuratedRomManifestStubOptions,
  artifactBytes: Buffer,
): CuratedRomManifestStub {
  assertHttpsUrl(options.artifactUrl, "artifactUrl");
  if (!trim(options.title)) throw new Error("title is required.");
  if (!trim(options.codeLicenseSpdx)) {
    throw new Error("codeLicenseSpdx is required.");
  }
  if (!trim(options.licenseUrl)) {
    throw new Error("licenseUrl is required as license evidence.");
  }
  const licenseUrl = optionalHttpsUrl(options.licenseUrl, "licenseUrl");
  if (!licenseUrl) throw new Error("licenseUrl is required as license evidence.");
  if (options.nonCommercialHostingAllowed === false) {
    throw new Error("nonCommercialHostingAllowed must be true.");
  }
  const permissionEvidenceUrl = optionalHttpsUrl(
    options.permissionEvidenceUrl,
    "permissionEvidenceUrl",
  );

  const manifestPath = trim(options.manifestPath);
  if (!manifestPath) throw new Error("manifestPath is required.");

  const artifactFilename = getArtifactFilename(
    options.artifactUrl,
    options.artifactFilename,
  );
  assertSupportedArtifactFilename(artifactFilename);
  assertCandidateArtifactHeader({ artifact_filename: artifactFilename }, artifactBytes);

  const source = resolvedSourceMetadata(options);
  const derivedArtifactUrl = artifactUrlFor(
    source.rawBaseUrl,
    source.sourceCommit,
    source.sourceEntryPath,
  );
  const slug = trim(options.slug) || slugify(options.title);
  const attributionText =
    trim(options.attributionText) ||
    `${trim(options.title)}${trim(options.developerName) ? ` by ${trim(options.developerName)}` : ""}. License: ${trim(options.codeLicenseSpdx)}. Source evidence: ${source.repoUrl}/blob/${source.sourceCommit}/${manifestPath}.`;

  return {
    entries: [
      {
        artifactFilename,
        artifactSha256: sha256(artifactBytes),
        artifactSize: artifactBytes.byteLength,
        ...(options.artifactUrl === derivedArtifactUrl
          ? {}
          : { artifactUrl: options.artifactUrl }),
        ...(trim(options.assetLicenseSpdx)
          ? { assetLicenseSpdx: trim(options.assetLicenseSpdx) }
          : {}),
        attributionText,
        codeLicenseSpdx: trim(options.codeLicenseSpdx),
        ...(trim(options.developerName)
          ? { developerName: trim(options.developerName) }
          : {}),
        ...(optionalHttpsUrl(options.developerUrl, "developerUrl")
          ? { developerUrl: trim(options.developerUrl) }
          : {}),
        licenseUrl,
        nonCommercialHostingAllowed: true,
        ...(optionalHttpsUrl(options.originalReleaseUrl, "originalReleaseUrl")
          ? { originalReleaseUrl: trim(options.originalReleaseUrl) }
          : {}),
        ...(permissionEvidenceUrl ? { permissionEvidenceUrl } : {}),
        rightsWarnings: options.rightsWarnings ?? [
          "Review playable artifact, source, license evidence, and cover-art rights before publication.",
        ],
        slug,
        sourceEntryPath: source.sourceEntryPath,
        title: trim(options.title),
      },
    ],
    manifestPath,
    rawBaseUrl: source.rawBaseUrl,
    repoUrl: source.repoUrl,
    sourceCommit: source.sourceCommit,
  };
}
