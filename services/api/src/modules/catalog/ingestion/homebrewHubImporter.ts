import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export type HomebrewHubSourceKind =
  | "homebrew_hub_gb"
  | "homebrew_hub_gba"
  | "homebrew_hub_nes";

export type HomebrewHubRepository = {
  commit: string;
  entriesDir: string;
  rawBaseUrl: string;
  repoUrl: string;
  sourceKind: HomebrewHubSourceKind;
};

export type HomebrewHubCandidate = {
  artifactFilename: string;
  artifactLocalPath: string;
  artifactSha256: string;
  artifactSize: number;
  artifactUrl: string;
  assetLicenseSpdx: string | null;
  attributionText: string;
  codeLicenseSpdx: string;
  developerName: string | null;
  developerUrl: string | null;
  licenseUrl: string | null;
  nonCommercialHostingAllowed: true;
  originalReleaseUrl: string | null;
  permissionEvidenceUrl: string | null;
  platformId: "nes" | "gb" | "gbc" | "gba";
  rightsWarnings: string[];
  runtimeId: "mesen" | "mgba";
  sourceCommit: string;
  sourceEntryPath: string;
  sourceKind: HomebrewHubSourceKind;
  sourceMetadata: Record<string, unknown>;
  sourceRepoUrl: string;
  title: string;
};

type HomebrewHubFileEntry = {
  default?: boolean;
  filename?: string;
  playable?: boolean;
};

type HomebrewHubGameJson = {
  author?: string;
  authors?: string[];
  developer?: string;
  files?: Array<HomebrewHubFileEntry | string>;
  gameLicense?: string;
  license?: string;
  source?: string;
  title?: string;
  website?: string;
};

type LicenseDecision = {
  licenseUrl: string | null;
  normalized: string;
};

const LICENSE_URLS: Record<string, string> = {
  "0BSD": "https://opensource.org/license/0bsd",
  "Apache-2.0": "https://www.apache.org/licenses/LICENSE-2.0",
  "BSD-3-Clause": "https://opensource.org/license/bsd-3-clause",
  "CC-BY-4.0": "https://creativecommons.org/licenses/by/4.0/",
  "CC-BY-SA-4.0": "https://creativecommons.org/licenses/by-sa/4.0/",
  "GPL-2.0-or-later": "https://www.gnu.org/licenses/old-licenses/gpl-2.0.html",
  "GPL-3.0": "https://www.gnu.org/licenses/gpl-3.0.html",
  "GPL-3.0-only": "https://www.gnu.org/licenses/gpl-3.0.html",
  "GPL-3.0-or-later": "https://www.gnu.org/licenses/gpl-3.0.html",
  MIT: "https://opensource.org/license/mit",
  "MPL-2.0": "https://www.mozilla.org/en-US/MPL/2.0/",
  Unlicense: "https://unlicense.org/",
  "WTFPL-2.0": "https://www.wtfpl.net/",
  Zlib: "https://www.zlib.net/zlib_license.html",
};

const LICENSE_ALIASES: Record<string, string> = {
  "Apache 2.0": "Apache-2.0",
  "Apache-2.0": "Apache-2.0",
  "BSD-3-Clause": "BSD-3-Clause",
  "CC-BY 4.0": "CC-BY-4.0",
  "CC-BY-4.0": "CC-BY-4.0",
  "CC-BY-SA 4.0": "CC-BY-SA-4.0",
  "CC-BY-SA-4.0": "CC-BY-SA-4.0",
  "GPL-2.0-or-later": "GPL-2.0-or-later",
  "GPL-3.0": "GPL-3.0",
  "GPL-3.0-only": "GPL-3.0-only",
  "GPL-3.0-or-later": "GPL-3.0-or-later",
  MIT: "MIT",
  "MPL-2.0": "MPL-2.0",
  Unlicense: "Unlicense",
  WTFPL: "WTFPL-2.0",
  "WTFPL-2.0": "WTFPL-2.0",
  ZLib: "Zlib",
  Zlib: "Zlib",
  "zlib/libpng": "Zlib",
  "0BSD": "0BSD",
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readJson(filePath: string): HomebrewHubGameJson | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
    return isPlainObject(parsed) ? (parsed as HomebrewHubGameJson) : null;
  } catch {
    return null;
  }
}

function normalizeLicense(value: string | null | undefined): LicenseDecision | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  const normalized = LICENSE_ALIASES[trimmed] || LICENSE_ALIASES[trimmed.replace(/\s+/g, " ")];
  if (!normalized) return null;

  return {
    licenseUrl: LICENSE_URLS[normalized] || null,
    normalized,
  };
}

function getPlayableFiles(metadata: HomebrewHubGameJson) {
  const files = metadata.files || [];
  return files
    .map((entry) => {
      if (typeof entry === "string") {
        return { filename: entry, playable: true, default: false };
      }
      return {
        filename: entry.filename || "",
        playable: entry.playable !== false,
        default: Boolean(entry.default),
      };
    })
    .filter((entry) => entry.filename && entry.playable);
}

function getPlatform(filename: string) {
  const extension = path.extname(filename).toLowerCase();
  if (extension === ".nes") return { platformId: "nes" as const, runtimeId: "mesen" as const };
  if (extension === ".gb") return { platformId: "gb" as const, runtimeId: "mgba" as const };
  if (extension === ".gbc") return { platformId: "gbc" as const, runtimeId: "mgba" as const };
  if (extension === ".gba") return { platformId: "gba" as const, runtimeId: "mgba" as const };
  return null;
}

function fileSha256(filePath: string) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function toPosixPath(value: string) {
  return value.split(path.sep).join("/");
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function rawUrlFor(repo: HomebrewHubRepository, relativePath: string) {
  return `${repo.rawBaseUrl.replace(/\/$/, "")}/${repo.commit}/${toPosixPath(relativePath)}`;
}

function developerName(metadata: HomebrewHubGameJson) {
  const author = stringValue(metadata.author);
  if (author) return author;

  const developer = stringValue(metadata.developer);
  if (developer) return developer;

  if (Array.isArray(metadata.authors)) {
    const firstAuthor = stringValue(metadata.authors[0]);
    if (firstAuthor) return firstAuthor;
  }

  return null;
}

function artifactCandidatesForEntry(
  repo: HomebrewHubRepository,
  entryDir: string,
  gameJsonPath: string,
): HomebrewHubCandidate[] {
  const metadata = readJson(gameJsonPath);
  if (!metadata?.title?.trim()) return [];
  const title = metadata.title.trim();

  const license = normalizeLicense(metadata.gameLicense || metadata.license);
  if (!license) return [];

  const relativeEntryPath = toPosixPath(path.relative(repo.entriesDir, gameJsonPath));
  const entryRelativeDir = path.dirname(relativeEntryPath);
  const sourceEntryPath = `entries/${relativeEntryPath}`;
  const playableFiles = getPlayableFiles(metadata);
  const author = developerName(metadata);

  return playableFiles.flatMap((fileEntry) => {
    const platform = getPlatform(fileEntry.filename);
    if (!platform) return [];

    const artifactPath = path.resolve(entryDir, fileEntry.filename);
    if (!fs.existsSync(artifactPath) || !fs.statSync(artifactPath).isFile()) {
      return [];
    }

    const artifactRelativePath = path.posix.join("entries", entryRelativeDir, fileEntry.filename);
    const artifactSize = fs.statSync(artifactPath).size;
    const rightsWarnings = metadata.gameLicense
      ? []
      : ["Entry uses a generic license field; reviewer must confirm it covers complete game assets and ROM redistribution."];

    return [
      {
        artifactFilename: path.posix.basename(fileEntry.filename),
        artifactLocalPath: artifactPath,
        artifactSha256: fileSha256(artifactPath),
        artifactSize,
        artifactUrl: rawUrlFor(repo, artifactRelativePath),
        assetLicenseSpdx: metadata.gameLicense ? license.normalized : null,
        attributionText: `${title}${author ? ` by ${author}` : ""}. License: ${license.normalized}. Source evidence: ${repo.repoUrl}/blob/${repo.commit}/${sourceEntryPath}.`,
        codeLicenseSpdx: license.normalized,
        developerName: author,
        developerUrl: metadata.website || metadata.source || null,
        licenseUrl: license.licenseUrl,
        nonCommercialHostingAllowed: true,
        originalReleaseUrl: metadata.website || null,
        permissionEvidenceUrl: license.licenseUrl,
        platformId: platform.platformId,
        rightsWarnings,
        runtimeId: platform.runtimeId,
        sourceCommit: repo.commit,
        sourceEntryPath,
        sourceKind: repo.sourceKind,
        sourceMetadata: metadata as Record<string, unknown>,
        sourceRepoUrl: repo.repoUrl,
        title,
      },
    ];
  });
}

export function collectHomebrewHubCandidates(
  repos: HomebrewHubRepository[],
): HomebrewHubCandidate[] {
  const candidates: HomebrewHubCandidate[] = [];

  for (const repo of repos) {
    if (!fs.existsSync(repo.entriesDir)) continue;
    const entryNames = fs.readdirSync(repo.entriesDir).sort();
    for (const entryName of entryNames) {
      const entryDir = path.join(repo.entriesDir, entryName);
      const gameJsonPath = path.join(entryDir, "game.json");
      if (!fs.existsSync(gameJsonPath)) continue;
      candidates.push(...artifactCandidatesForEntry(repo, entryDir, gameJsonPath));
    }
  }

  return candidates.sort((a, b) =>
    `${a.platformId}:${a.title}:${a.artifactFilename}`.localeCompare(
      `${b.platformId}:${b.title}:${b.artifactFilename}`,
    ),
  );
}
