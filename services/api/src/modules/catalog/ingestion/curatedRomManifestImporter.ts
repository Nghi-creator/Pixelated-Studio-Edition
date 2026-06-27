import fs from "node:fs";
import path from "node:path";

type CuratedRomManifestEntry = {
  artifactFilename?: unknown;
  artifactSha256?: unknown;
  artifactSize?: unknown;
  artifactUrl?: unknown;
  assetLicenseSpdx?: unknown;
  attributionText?: unknown;
  codeLicenseSpdx?: unknown;
  developerName?: unknown;
  developerUrl?: unknown;
  licenseUrl?: unknown;
  originalReleaseUrl?: unknown;
  rightsWarnings?: unknown;
  slug?: unknown;
  sourceEntryPath?: unknown;
  title?: unknown;
};

export type CuratedRomSkippedEntry = {
  artifactFilename: string | null;
  index: number;
  reasons: string[];
  title: string | null;
};

export type CuratedRomManifest = {
  entries: CuratedRomManifestEntry[];
  manifestPath: string;
  rawBaseUrl: string;
  repoUrl: string;
  sourceCommit: string;
};

export type CuratedRomCandidate = {
  artifactFilename: string;
  artifactSha256: string;
  artifactSize: number;
  artifactUrl: string;
  assetLicenseSpdx: string | null;
  attributionText: string;
  codeLicenseSpdx: string;
  developerName: string | null;
  developerUrl: string | null;
  licenseUrl: string | null;
  originalReleaseUrl: string | null;
  platformId:
    | "nes"
    | "gb"
    | "gbc"
    | "gba"
    | "snes"
    | "genesis"
    | "sms"
    | "game_gear";
  rightsWarnings: string[];
  runtimeId: "mesen" | "mgba" | "bsnes" | "picodrive";
  sourceCommit: string;
  sourceEntryPath: string;
  sourceKind: "curated_licensed_rom";
  sourceMetadata: Record<string, unknown>;
  sourceRepoUrl: string;
  title: string;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function nullableString(value: unknown) {
  const text = stringValue(value);
  return text || null;
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.flatMap((entry) => {
        const text = stringValue(entry);
        return text ? [text] : [];
      })
    : [];
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
}

function getPlatform(filename: string) {
  const extension = path.extname(filename).toLowerCase();
  if (extension === ".nes") {
    return { platformId: "nes" as const, runtimeId: "mesen" as const };
  }
  if (extension === ".gb") {
    return { platformId: "gb" as const, runtimeId: "mgba" as const };
  }
  if (extension === ".gbc") {
    return { platformId: "gbc" as const, runtimeId: "mgba" as const };
  }
  if (extension === ".gba") {
    return { platformId: "gba" as const, runtimeId: "mgba" as const };
  }
  if (extension === ".sfc" || extension === ".smc") {
    return { platformId: "snes" as const, runtimeId: "bsnes" as const };
  }
  if (extension === ".md" || extension === ".gen") {
    return { platformId: "genesis" as const, runtimeId: "picodrive" as const };
  }
  if (extension === ".sms") {
    return { platformId: "sms" as const, runtimeId: "picodrive" as const };
  }
  if (extension === ".gg") {
    return { platformId: "game_gear" as const, runtimeId: "picodrive" as const };
  }
  return null;
}

export function readCuratedRomManifest(manifestPath: string): CuratedRomManifest {
  const parsed = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as unknown;
  if (!isPlainObject(parsed)) {
    throw new Error("Curated ROM manifest must be an object.");
  }

  const manifest = {
    entries: Array.isArray(parsed.entries)
      ? (parsed.entries as CuratedRomManifestEntry[])
      : [],
    manifestPath: stringValue(parsed.manifestPath),
    rawBaseUrl: stringValue(parsed.rawBaseUrl),
    repoUrl: stringValue(parsed.repoUrl),
    sourceCommit: stringValue(parsed.sourceCommit).toLowerCase(),
  };

  if (!manifest.repoUrl || !manifest.rawBaseUrl || !manifest.manifestPath) {
    throw new Error("Curated ROM manifest is missing repository metadata.");
  }
  assertHttpsUrl(manifest.repoUrl, "repoUrl");
  assertHttpsUrl(manifest.rawBaseUrl, "rawBaseUrl");
  if (!/^[a-f0-9]{40}$/.test(manifest.sourceCommit)) {
    throw new Error("Curated ROM manifest sourceCommit must be a 40-character SHA-1.");
  }
  if (manifest.entries.length === 0) {
    throw new Error("Curated ROM manifest must include entries.");
  }

  return manifest;
}

function artifactUrlFor(manifest: CuratedRomManifest, sourceEntryPath: string) {
  return `${manifest.rawBaseUrl.replace(/\/$/, "")}/${manifest.sourceCommit}/${sourceEntryPath.replace(/^\/+/, "")}`;
}

function skippedEntry(
  entry: unknown,
  index: number,
  reasons: string[],
): CuratedRomSkippedEntry {
  const record = isPlainObject(entry) ? entry : {};
  return {
    artifactFilename: nullableString(record.artifactFilename),
    index,
    reasons,
    title: nullableString(record.title),
  };
}

export function collectCuratedRomCandidateReport(manifest: CuratedRomManifest) {
  const candidates: CuratedRomCandidate[] = [];
  const skipped: CuratedRomSkippedEntry[] = [];

  manifest.entries.forEach((entry, index) => {
    if (!isPlainObject(entry)) {
      skipped.push(skippedEntry(entry, index, ["entry is not an object"]));
      return;
    }

    const reasons: string[] = [];
    const title = stringValue(entry.title);
    const artifactFilename = stringValue(entry.artifactFilename);
    const sourceEntryPath = stringValue(entry.sourceEntryPath);
    const codeLicenseSpdx = stringValue(entry.codeLicenseSpdx);
    const artifactSha256 = stringValue(entry.artifactSha256).toLowerCase();
    const artifactSize = Number(entry.artifactSize);
    const platform = getPlatform(artifactFilename);
    const slug = stringValue(entry.slug) || artifactFilename || String(index);

    if (!title) reasons.push("missing title");
    if (!artifactFilename) reasons.push("missing artifactFilename");
    if (!sourceEntryPath) reasons.push("missing sourceEntryPath");
    if (artifactFilename && !platform) {
      reasons.push("unsupported artifact extension");
    }
    if (!codeLicenseSpdx) reasons.push("missing codeLicenseSpdx");
    if (!/^[a-f0-9]{64}$/.test(artifactSha256)) {
      reasons.push("artifactSha256 must be 64 lowercase hex characters");
    }
    if (!Number.isSafeInteger(artifactSize) || artifactSize <= 0) {
      reasons.push("artifactSize must be a positive safe integer");
    }

    if (reasons.length > 0 || !platform) {
      skipped.push(skippedEntry(entry, index, reasons));
      return;
    }

    const artifactUrl =
      stringValue(entry.artifactUrl) || artifactUrlFor(manifest, sourceEntryPath);
    try {
      assertHttpsUrl(artifactUrl, "artifactUrl");
    } catch (error) {
      skipped.push(
        skippedEntry(entry, index, [
          error instanceof Error ? error.message : String(error),
        ]),
      );
      return;
    }

    const licenseUrl = nullableString(entry.licenseUrl);
    if (licenseUrl) {
      try {
        assertHttpsUrl(licenseUrl, "licenseUrl");
      } catch (error) {
        skipped.push(
          skippedEntry(entry, index, [
            error instanceof Error ? error.message : String(error),
          ]),
        );
        return;
      }
    }

    candidates.push({
      artifactFilename,
      artifactSha256,
      artifactSize,
      artifactUrl,
      assetLicenseSpdx: nullableString(entry.assetLicenseSpdx),
      attributionText:
        stringValue(entry.attributionText) ||
        `${title}. License: ${codeLicenseSpdx}. Source evidence: ${manifest.repoUrl}/blob/${manifest.sourceCommit}/${manifest.manifestPath}.`,
      codeLicenseSpdx,
      developerName: nullableString(entry.developerName),
      developerUrl: nullableString(entry.developerUrl),
      licenseUrl,
      originalReleaseUrl: nullableString(entry.originalReleaseUrl),
      platformId: platform.platformId,
      rightsWarnings: stringArray(entry.rightsWarnings),
      runtimeId: platform.runtimeId,
      sourceCommit: manifest.sourceCommit,
      sourceEntryPath: `${manifest.manifestPath}#${slug}`,
      sourceKind: "curated_licensed_rom",
      sourceMetadata: entry,
      sourceRepoUrl: manifest.repoUrl,
      title,
    });
  });

  return { candidates, skipped };
}

export function collectCuratedRomCandidates(
  manifest: CuratedRomManifest,
): CuratedRomCandidate[] {
  return collectCuratedRomCandidateReport(manifest).candidates;
}
