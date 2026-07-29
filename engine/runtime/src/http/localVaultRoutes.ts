import crypto from "crypto";
import fs from "fs";
import path from "path";
import type { Express, Request, RequestHandler, Response } from "express";
import { validateGameArtifact } from "../roms/artifactValidation";
import {
  assertLocalRomPath,
  ensureUserFolder,
  getUserFolderPath,
  getVaultFilePath,
  sanitizeUserId,
} from "../roms/localRomStore";
import {
  findRuntimeByExtension,
  getSupportedExtensions,
} from "../runtime/runtimeRegistry";

const multer = require("multer");

type MulterError = Error & {
  code?: string;
};

type FileSystemError = Error & {
  code?: string;
};

type MulterFile = {
  filename: string;
  originalname: string;
  path: string;
};

type RequestWithFile = Request & {
  file?: MulterFile;
};

type LocalVaultRouteOptions = {
  getVaultOwnerId: (req: Request) => string;
  maxRomSizeBytes: number;
  requireEngineToken: RequestHandler;
};

type LocalVaultRateLimitOptions = {
  globalLimit: number;
  limit: number;
  now?: () => number;
  windowMs: number;
};

type RateLimitWindow = {
  count: number;
  resetAt: number;
};

const MAX_RATE_LIMIT_KEYS = 1_024;

export function createLocalVaultRateLimiter({
  globalLimit,
  limit,
  now = Date.now,
  windowMs,
}: LocalVaultRateLimitOptions): RequestHandler {
  const keyedWindows = new Map<string, RateLimitWindow>();
  let globalWindow: RateLimitWindow = { count: 0, resetAt: 0 };

  return (req, res, next) => {
    const currentTime = now();
    if (globalWindow.resetAt <= currentTime) {
      globalWindow = {
        count: 0,
        resetAt: currentTime + windowMs,
      };
    }
    globalWindow.count += 1;

    const identity =
      req.get("x-pixelated-access-id") ||
      req.get("x-pixelated-client-id") ||
      req.ip ||
      req.socket.remoteAddress ||
      "unknown";
    const identityKey = crypto
      .createHash("sha256")
      .update(identity)
      .digest("base64url");
    let key = identityKey;
    if (!keyedWindows.has(key) && keyedWindows.size >= MAX_RATE_LIMIT_KEYS) {
      for (const [storedKey, storedWindow] of keyedWindows) {
        if (storedWindow.resetAt <= currentTime) {
          keyedWindows.delete(storedKey);
        }
      }
    }
    if (!keyedWindows.has(key) && keyedWindows.size >= MAX_RATE_LIMIT_KEYS) {
      key = "overflow";
    }

    const existing = keyedWindows.get(key);
    const rateWindow =
      !existing || existing.resetAt <= currentTime
        ? { count: 0, resetAt: currentTime + windowMs }
        : existing;
    rateWindow.count += 1;
    keyedWindows.set(key, rateWindow);

    if (rateWindow.count > limit || globalWindow.count > globalLimit) {
      const resetAt = Math.max(rateWindow.resetAt, globalWindow.resetAt);
      res.set("Cache-Control", "no-store");
      res.set(
        "Retry-After",
        String(Math.max(1, Math.ceil((resetAt - currentTime) / 1_000))),
      );
      res.status(429).json({ error: "Too many Local Vault requests" });
      return;
    }

    next();
  };
}

async function isRealDirectory(folderPath: string) {
  try {
    const folderStat = await fs.promises.lstat(
      assertLocalRomPath(folderPath),
    );
    return folderStat.isDirectory() && !folderStat.isSymbolicLink();
  } catch {
    return false;
  }
}

async function resolveVaultFolder(
  req: Request,
  getVaultOwnerId: LocalVaultRouteOptions["getVaultOwnerId"],
) {
  const ownerIdCandidate = getVaultOwnerId(req);
  const ownerId = path.basename(ownerIdCandidate);
  if (
    !ownerId ||
    ownerId !== ownerIdCandidate ||
    sanitizeUserId(ownerId) !== ownerId
  ) {
    throw new Error("Missing authenticated engine client identity");
  }

  const ownerFolder = getUserFolderPath(ownerId);
  if (await isRealDirectory(ownerFolder)) return ownerFolder;

  // Raw local pairings previously stored ROMs under the browser-supplied
  // account id. Migrate that folder once, but never allow companion tokens to
  // select a legacy namespace.
  const accessScope = req.get("x-pixelated-access-scope");
  if (
    accessScope !== "companion-host" &&
    accessScope !== "companion-guest"
  ) {
    const legacyUserIdCandidate = req.get("x-user-id") || "";
    const legacyUserId = path.basename(legacyUserIdCandidate);
    const legacyFolder = getUserFolderPath(legacyUserId);
    if (
      legacyUserId === legacyUserIdCandidate &&
      sanitizeUserId(legacyUserId) === legacyUserId &&
      legacyUserId !== "anonymous" &&
      legacyFolder !== ownerFolder &&
      (await isRealDirectory(legacyFolder))
    ) {
      await fs.promises.rename(
        assertLocalRomPath(legacyFolder),
        assertLocalRomPath(ownerFolder),
      );
      return ownerFolder;
    }
  }

  return ensureUserFolder(ownerId);
}

export function sanitizeLocalVaultLogValue(value: unknown) {
  return String(value)
    .replace(/\r|\n/g, " ")
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .slice(0, 200);
}

function createLocalVaultUpload(
  maxRomSizeBytes: number,
  getVaultOwnerId: LocalVaultRouteOptions["getVaultOwnerId"],
) {
  const supportedExtensions = getSupportedExtensions();
  const storage = multer.diskStorage({
    destination(
      req: Request,
      file: MulterFile,
      cb: (err: Error | null, destination: string) => void,
    ) {
      void resolveVaultFolder(req, getVaultOwnerId).then(
        (destination) => cb(null, destination),
        (error) =>
          cb(
            error instanceof Error ? error : new Error(String(error)),
            "",
          ),
      );
    },
    filename(
      req: Request,
      file: MulterFile,
      cb: (err: Error | null, filename: string) => void,
    ) {
      const safeFilename = path.basename(file.originalname || "unknown.rom");
      cb(null, `${Date.now()}-${crypto.randomUUID()}-${safeFilename}`);
    },
  });

  return multer({
    storage,
    limits: {
      fileSize: maxRomSizeBytes,
      files: 1,
    },
    fileFilter(
      req: Request,
      file: MulterFile,
      cb: (err: Error | null, acceptFile?: boolean) => void,
    ) {
      const safeFilename = path.basename(file.originalname || "");
      const lowerFilename = safeFilename.toLowerCase();
      if (
        !supportedExtensions.some((extension) =>
          lowerFilename.endsWith(extension),
        )
      ) {
        cb(
          new Error(
            `Only ${supportedExtensions.join(", ")} game files are supported`,
          ),
        );
        return;
      }

      cb(null, true);
    },
  });
}

export function registerLocalVaultRoutes(
  app: Express,
  options: LocalVaultRouteOptions,
): void {
  const { getVaultOwnerId, maxRomSizeBytes, requireEngineToken } = options;
  const upload = createLocalVaultUpload(maxRomSizeBytes, getVaultOwnerId);
  const supportedExtensions = getSupportedExtensions();
  const listRateLimit = createLocalVaultRateLimiter({
    globalLimit: 600,
    limit: 60,
    windowMs: 60_000,
  });
  const uploadRateLimit = createLocalVaultRateLimiter({
    globalLimit: 100,
    limit: 10,
    windowMs: 60_000,
  });
  const deleteRateLimit = createLocalVaultRateLimiter({
    globalLimit: 300,
    limit: 30,
    windowMs: 60_000,
  });

  app.get(
    "/local-games",
    requireEngineToken,
    listRateLimit,
    async (req: Request, res: Response) => {
      try {
        const userFolder = await resolveVaultFolder(req, getVaultOwnerId);

        const entries = await fs.promises.readdir(userFolder, {
          withFileTypes: true,
        });
        const files = (
          await Promise.all(
            entries
              .filter((entry) => {
                if (!entry.isFile()) return false;
                const lowerFilename = entry.name.toLowerCase();
                return supportedExtensions.some((extension) =>
                  lowerFilename.endsWith(extension),
                );
              })
              .map(async (entry) => ({
                name: entry.name,
                time: (
                  await fs.promises.stat(
                    getVaultFilePath(userFolder, entry.name),
                  )
                ).mtime.getTime(),
              })),
          )
        )
          .sort((a, b) => b.time - a.time)
          .map((file) => file.name);

        res.json(files);
      } catch (err) {
        console.error("Failed to read user directory:", err);
        res.json([]);
      }
    },
  );

  app.post(
    "/upload",
    requireEngineToken,
    uploadRateLimit,
    (req: Request, res: Response) => {
      upload.single("romFile")(req, res, async (err?: MulterError) => {
        if (err && err instanceof multer.MulterError) {
          const message =
            err.code === "LIMIT_FILE_SIZE"
              ? `ROM file is too large. Max size is ${maxRomSizeBytes} bytes.`
              : err.message;
          return res.status(400).json({ error: message });
        }

        if (err) {
          return res.status(400).json({ error: err.message });
        }

        const uploadRequest = req as RequestWithFile;
        if (!uploadRequest.file) {
          return res.status(400).json({ error: "No file uploaded" });
        }

        let uploadedFilePath: string;
        try {
          const userFolder = await resolveVaultFolder(req, getVaultOwnerId);
          uploadedFilePath = getVaultFilePath(
            userFolder,
            uploadRequest.file.filename,
          );
          if (
            assertLocalRomPath(uploadRequest.file.path) !== uploadedFilePath
          ) {
            throw new Error("Multer upload path did not match the vault path");
          }
        } catch {
          return res.status(400).json({ error: "Invalid upload path" });
        }

        const runtime = findRuntimeByExtension(uploadRequest.file.filename);
        if (!runtime) {
          fs.unlink(uploadedFilePath, () => {});
          return res.status(400).json({ error: "Unsupported game file type" });
        }

        try {
          validateGameArtifact(uploadedFilePath, {
            fileLabel: "Local game file",
            runtimeId: runtime.id,
          });
        } catch (validationError) {
          fs.unlink(uploadedFilePath, () => {});
          return res.status(400).json({
            error:
              validationError instanceof Error
                ? validationError.message
                : "Invalid game file",
          });
        }

        const sanitizedOriginalName = sanitizeLocalVaultLogValue(
          uploadRequest.file.originalname,
        );
        console.log(
          `[Library] New local game added for user: ${sanitizedOriginalName}`,
        );
        res.json({ success: true, filename: uploadRequest.file.filename });
      });
    },
  );

  app.delete(
    "/local-games/:filename",
    requireEngineToken,
    deleteRateLimit,
    async (req: Request, res: Response) => {
      try {
        const userFolder = await resolveVaultFolder(req, getVaultOwnerId);
        const filenameParam = req.params.filename;
        const decodedName = decodeURIComponent(
          Array.isArray(filenameParam) ? filenameParam[0] : filenameParam,
        );
        const safeName = path.basename(decodedName);
        if (safeName !== decodedName) {
          res.status(400).json({ error: "Invalid filename" });
          return;
        }
        const filePath = getVaultFilePath(userFolder, safeName);

        try {
          await fs.promises.unlink(filePath);
          console.log(`[Library] Deleted local game: ${safeName}`);
          res.json({ success: true });
        } catch (error) {
          if ((error as FileSystemError).code === "ENOENT") {
            res.status(404).json({ error: "File not found" });
            return;
          }
          throw error;
        }
      } catch (err) {
        console.error("Failed to delete file:", err);
        res.status(500).json({ error: "Failed to delete file" });
      }
    },
  );
}
