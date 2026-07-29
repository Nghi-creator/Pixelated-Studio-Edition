import fs from "fs";
import path from "path";

export const DEFAULT_CLOUD_ROM_STAGING_ROOT = "/roms/.cloud";

function prepareStagingRoot(stagingRoot: string) {
  const resolvedRoot = path.resolve(stagingRoot);
  fs.mkdirSync(resolvedRoot, { mode: 0o700, recursive: true });

  const rootStat = fs.lstatSync(resolvedRoot);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw new Error("Cloud ROM staging root must be a private directory");
  }
  fs.chmodSync(resolvedRoot, 0o700);
  return resolvedRoot;
}

export function createCloudRomStagingPath(
  extension: string,
  stagingRoot = DEFAULT_CLOUD_ROM_STAGING_ROOT,
) {
  const resolvedRoot = prepareStagingRoot(stagingRoot);
  const stagingDirectory = fs.mkdtempSync(
    path.join(resolvedRoot, "session-"),
  );
  fs.chmodSync(stagingDirectory, 0o700);
  return path.join(stagingDirectory, `game${extension}`);
}

export function removeCloudRomStagingArtifact(
  filePath: string,
  stagingRoot = DEFAULT_CLOUD_ROM_STAGING_ROOT,
) {
  const resolvedRoot = path.resolve(stagingRoot);
  const stagingDirectory = path.dirname(path.resolve(filePath));
  if (
    path.dirname(stagingDirectory) !== resolvedRoot ||
    !path.basename(stagingDirectory).startsWith("session-")
  ) {
    throw new Error("Refusing to remove an invalid cloud ROM staging path");
  }

  fs.rmSync(stagingDirectory, { force: true, recursive: true });
}
