import crypto from "crypto";
import fs from "fs";
import path from "path";
import type { Express, Request, RequestHandler, Response } from "express";
import { validateGameArtifact } from "../roms/artifactValidation";
import {
  ensureUserFolder,
  getUserFolderPath,
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

async function pathExists(filePath: string) {
  try {
    await fs.promises.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function resolveVaultFolder(
  req: Request,
  getVaultOwnerId: LocalVaultRouteOptions["getVaultOwnerId"],
) {
  const ownerId = getVaultOwnerId(req);
  if (!ownerId) {
    throw new Error("Missing authenticated engine client identity");
  }

  const ownerFolder = getUserFolderPath(ownerId);
  if (await pathExists(ownerFolder)) return ownerFolder;

  // Raw local pairings previously stored ROMs under the browser-supplied
  // account id. Migrate that folder once, but never allow companion tokens to
  // select a legacy namespace.
  const accessScope = req.get("x-pixelated-access-scope");
  if (
    accessScope !== "companion-host" &&
    accessScope !== "companion-guest"
  ) {
    const legacyUserId = sanitizeUserId(req.get("x-user-id"));
    const legacyFolder = getUserFolderPath(legacyUserId);
    if (
      legacyUserId !== "anonymous" &&
      legacyFolder !== ownerFolder &&
      (await pathExists(legacyFolder))
    ) {
      await fs.promises.rename(legacyFolder, ownerFolder);
      return ownerFolder;
    }
  }

  return ensureUserFolder(ownerId);
}

function createLocalVaultUpload(
  maxRomSizeBytes: number,
  getVaultOwnerId: LocalVaultRouteOptions["getVaultOwnerId"],
) {
  const supportedExtensions = getSupportedExtensions();
  const storage = multer.diskStorage({
    destination(req: Request, file: MulterFile, cb: (err: Error | null, destination: string) => void) {
      void resolveVaultFolder(req, getVaultOwnerId).then(
        (destination) => cb(null, destination),
        (error) => cb(error instanceof Error ? error : new Error(String(error)), ""),
      );
    },
    filename(req: Request, file: MulterFile, cb: (err: Error | null, filename: string) => void) {
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

  app.get(
    "/local-games",
    requireEngineToken,
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
                  await fs.promises.stat(path.join(userFolder, entry.name))
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

  app.post("/upload", requireEngineToken, (req: Request, res: Response) => {
    upload.single("romFile")(req, res, (err?: MulterError) => {
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

      const runtime = findRuntimeByExtension(uploadRequest.file.filename);
      if (!runtime) {
        fs.unlink(uploadRequest.file.path, () => {});
        return res.status(400).json({ error: "Unsupported game file type" });
      }

      try {
        validateGameArtifact(uploadRequest.file.path, {
          fileLabel: "Local game file",
          runtimeId: runtime.id,
        });
      } catch (validationError) {
        fs.unlink(uploadRequest.file.path, () => {});
        return res.status(400).json({
          error:
            validationError instanceof Error
              ? validationError.message
              : "Invalid game file",
        });
      }

      console.log(
        `[Library] New local game added for user: ${uploadRequest.file.originalname}`,
      );
      res.json({ success: true, filename: uploadRequest.file.filename });
    });
  });

  app.delete(
    "/local-games/:filename",
    requireEngineToken,
    async (req: Request, res: Response) => {
      try {
        const userFolder = await resolveVaultFolder(req, getVaultOwnerId);
        const filenameParam = req.params.filename;
        const decodedName = decodeURIComponent(
          Array.isArray(filenameParam) ? filenameParam[0] : filenameParam,
        );
        const safeName = path.basename(decodedName);
        const filePath = path.join(userFolder, safeName);

        if (await pathExists(filePath)) {
          await fs.promises.unlink(filePath);
          console.log(`[Library] Deleted local game: ${safeName}`);
          res.json({ success: true });
        } else {
          res.status(404).json({ error: "File not found" });
        }
      } catch (err) {
        console.error("Failed to delete file:", err);
        res.status(500).json({ error: "Failed to delete file" });
      }
    },
  );
}
