import crypto from "node:crypto";
import fs from "node:fs";

export type DebianNativeLockPackage = {
  args: string[];
  executable: string;
  licenseUrl: string;
  manifestId: string;
  packageName: string;
  packageUrl: string;
  packageVersion: string;
  sourcePackageName: string;
  sourcePackageVersion: string;
  sourceUrl: string;
  title: string;
};

export type DebianNativeLockManifest = {
  component: "main";
  distribution: "debian";
  packages: DebianNativeLockPackage[];
  runtimeId: "debian-native-v1";
  schemaVersion: 1;
  section: "games";
  suite: string;
};

export type DebianNativeCandidate = {
  assetLicenseSpdx: "Debian-main";
  attributionText: string;
  codeLicenseSpdx: "Debian-main";
  developerName: string | null;
  developerUrl: string | null;
  licenseUrl: string;
  launchManifestId: string;
  nonCommercialHostingAllowed: true;
  originalReleaseUrl: string;
  packageComponent: "main";
  packageName: string;
  packageVersion: string;
  platformId: "linux";
  permissionEvidenceUrl: string;
  rightsWarnings: string[];
  runtimeId: "debian-native-v1";
  sourceCommit: string;
  sourceEntryPath: string;
  sourceKind: "debian_main_games";
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

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function sourceRevisionFor(manifest: DebianNativeLockManifest, pkg: DebianNativeLockPackage) {
  return crypto
    .createHash("sha1")
    .update(
      [
        manifest.distribution,
        manifest.suite,
        manifest.component,
        manifest.runtimeId,
        pkg.manifestId,
        pkg.packageName,
        pkg.packageVersion,
        pkg.sourcePackageVersion,
      ].join("\0"),
    )
    .digest("hex");
}

export function readDebianNativeLockManifest(
  manifestPath: string,
): DebianNativeLockManifest {
  const parsed = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as unknown;
  if (!isPlainObject(parsed)) {
    throw new Error("Debian native lock manifest must be an object.");
  }

  const manifest: DebianNativeLockManifest = {
    component: stringValue(parsed.component) as DebianNativeLockManifest["component"],
    distribution: stringValue(parsed.distribution) as DebianNativeLockManifest["distribution"],
    packages: [],
    runtimeId: stringValue(parsed.runtimeId) as DebianNativeLockManifest["runtimeId"],
    schemaVersion: Number(parsed.schemaVersion) as DebianNativeLockManifest["schemaVersion"],
    section: stringValue(parsed.section) as DebianNativeLockManifest["section"],
    suite: stringValue(parsed.suite),
  };

  if (
    manifest.schemaVersion !== 1 ||
    manifest.distribution !== "debian" ||
    manifest.component !== "main" ||
    manifest.section !== "games" ||
    manifest.runtimeId !== "debian-native-v1" ||
    !manifest.suite
  ) {
    throw new Error("Debian native lock manifest has unsupported top-level metadata.");
  }

  if (!Array.isArray(parsed.packages)) {
    throw new Error("Debian native lock manifest must include packages.");
  }

  manifest.packages = parsed.packages.map((entry, index) => {
    if (!isPlainObject(entry)) {
      throw new Error(`Debian native package at index ${index} must be an object.`);
    }
    const pkg: DebianNativeLockPackage = {
      args: stringArray(entry.args),
      executable: stringValue(entry.executable),
      licenseUrl: stringValue(entry.licenseUrl),
      manifestId: stringValue(entry.manifestId),
      packageName: stringValue(entry.packageName),
      packageUrl: stringValue(entry.packageUrl),
      packageVersion: stringValue(entry.packageVersion),
      sourcePackageName: stringValue(entry.sourcePackageName),
      sourcePackageVersion: stringValue(entry.sourcePackageVersion),
      sourceUrl: stringValue(entry.sourceUrl),
      title: stringValue(entry.title),
    };

    if (
      !pkg.title ||
      !pkg.manifestId ||
      !pkg.packageName ||
      !pkg.packageVersion ||
      !pkg.sourcePackageName ||
      !pkg.sourcePackageVersion ||
      !pkg.executable.startsWith("/usr/games/") ||
      !pkg.licenseUrl.startsWith("https://metadata.ftp-master.debian.org/") ||
      !pkg.sourceUrl.startsWith("https://tracker.debian.org/pkg/") ||
      !pkg.packageUrl.startsWith("https://packages.debian.org/")
    ) {
      throw new Error(`Debian native package ${pkg.packageName || index} is incomplete or not allowlisted.`);
    }

    return pkg;
  });

  return manifest;
}

export function collectDebianNativeCandidates(
  manifest: DebianNativeLockManifest,
): DebianNativeCandidate[] {
  return manifest.packages
    .map((pkg) => {
      const sourceCommit = sourceRevisionFor(manifest, pkg);
      return {
        assetLicenseSpdx: "Debian-main" as const,
        attributionText: `${pkg.title} from Debian ${manifest.suite} main/games package ${pkg.packageName} ${pkg.packageVersion}. Copyright evidence: ${pkg.licenseUrl}. Source package: ${pkg.sourceUrl}.`,
        codeLicenseSpdx: "Debian-main" as const,
        developerName: "Debian Games Team",
        developerUrl: pkg.sourceUrl,
        licenseUrl: pkg.licenseUrl,
        launchManifestId: pkg.manifestId,
        nonCommercialHostingAllowed: true as const,
        originalReleaseUrl: pkg.packageUrl,
        packageComponent: "main" as const,
        packageName: pkg.packageName,
        packageVersion: pkg.packageVersion,
        platformId: "linux" as const,
        permissionEvidenceUrl: pkg.licenseUrl,
        rightsWarnings: [
          "Reviewer must confirm Debian copyright file covers code, data, artwork, and audio for hosted streaming.",
          "Reviewer must confirm the native runtime image pins the same package version.",
        ],
        runtimeId: manifest.runtimeId,
        sourceCommit,
        sourceEntryPath: `${manifest.suite}/main/games/${pkg.packageName}/${pkg.packageVersion}`,
        sourceKind: "debian_main_games" as const,
        sourceMetadata: {
          args: pkg.args,
          component: manifest.component,
          distribution: manifest.distribution,
          executable: pkg.executable,
          manifestId: pkg.manifestId,
          packageName: pkg.packageName,
          packageUrl: pkg.packageUrl,
          packageVersion: pkg.packageVersion,
          section: manifest.section,
          sourcePackageName: pkg.sourcePackageName,
          sourcePackageVersion: pkg.sourcePackageVersion,
          suite: manifest.suite,
        },
        sourceRepoUrl: pkg.sourceUrl,
        title: pkg.title,
      };
    })
    .sort((left, right) => left.title.localeCompare(right.title));
}
