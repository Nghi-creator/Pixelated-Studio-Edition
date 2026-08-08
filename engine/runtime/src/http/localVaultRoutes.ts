import crypto from "crypto";
import multer from "multer";
import path from "path";
import type { Express, Request, RequestHandler, Response } from "express";
import {
  deleteVaultGame,
  listVaultGames,
  resolveVaultFolder,
  validateVaultUpload,
  type VaultOwnerContext,
} from "../roms/localVaultService";
import { getSupportedExtensions } from "../runtime/runtimeRegistry";
import { createLocalVaultRateLimiter } from "../security/localVaultRateLimiter";

export { createLocalVaultRateLimiter };

type MulterFile = { filename: string; originalname: string; path: string };
type RequestWithFile = Request & { file?: MulterFile };

type LocalVaultRouteOptions = {
  getVaultOwnerId: (req: Request) => string;
  maxRomSizeBytes: number;
  requireEngineToken: RequestHandler;
};

function getVaultOwnerContext(
  req: Request,
  getVaultOwnerId: LocalVaultRouteOptions["getVaultOwnerId"],
): VaultOwnerContext {
  return {
    accessScope: req.get("x-pixelated-access-scope"),
    legacyUserIdCandidate: req.get("x-user-id"),
    ownerIdCandidate: getVaultOwnerId(req),
  };
}

function createLocalVaultUpload(
  maxRomSizeBytes: number,
  getVaultOwnerId: LocalVaultRouteOptions["getVaultOwnerId"],
) {
  const supportedExtensions = getSupportedExtensions();
  const storage = multer.diskStorage({
    destination(
      req: Request,
      _file: MulterFile,
      cb: (err: Error | null, destination: string) => void,
    ) {
      void resolveVaultFolder(getVaultOwnerContext(req, getVaultOwnerId)).then(
        (destination) => cb(null, destination),
        (error) => cb(error instanceof Error ? error : new Error(String(error)), ""),
      );
    },
    filename(
      _req: Request,
      file: MulterFile,
      cb: (err: Error | null, filename: string) => void,
    ) {
      const safeFilename = path.basename(file.originalname || "unknown.rom");
      cb(null, `${Date.now()}-${crypto.randomUUID()}-${safeFilename}`);
    },
  });

  return multer({
    storage,
    limits: { fileSize: maxRomSizeBytes, files: 1 },
    fileFilter(
      _req: Request,
      file: MulterFile,
      cb: (err: Error | null, acceptFile?: boolean) => void,
    ) {
      const lowerFilename = path.basename(file.originalname || "").toLowerCase();
      if (!supportedExtensions.some((extension) => lowerFilename.endsWith(extension))) {
        cb(new Error(`Only ${supportedExtensions.join(", ")} game files are supported`));
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
        res.json(await listVaultGames(getVaultOwnerContext(req, getVaultOwnerId)));
      } catch (error) {
        console.error("Failed to read user directory:", error);
        res.json([]);
      }
    },
  );

  app.post(
    "/upload",
    requireEngineToken,
    uploadRateLimit,
    (req: Request, res: Response) => {
      upload.single("romFile")(req, res, async (error?: unknown) => {
        if (error && error instanceof multer.MulterError) {
          const message =
            error.code === "LIMIT_FILE_SIZE"
              ? `ROM file is too large. Max size is ${maxRomSizeBytes} bytes.`
              : error.message;
          return res.status(400).json({ error: message });
        }
        if (error) {
          const message = error instanceof Error ? error.message : "Upload failed";
          return res.status(400).json({ error: message });
        }

        const uploadedFile = (req as RequestWithFile).file;
        if (!uploadedFile) return res.status(400).json({ error: "No file uploaded" });

        let result: Awaited<ReturnType<typeof validateVaultUpload>>;
        try {
          result = await validateVaultUpload(
            getVaultOwnerContext(req, getVaultOwnerId),
            uploadedFile,
          );
        } catch {
          return res.status(400).json({ error: "Invalid upload path" });
        }
        if (!result.ok) return res.status(400).json({ error: result.error });

        console.log("[Library] New local game added");
        return res.json({ success: true, filename: result.filename });
      });
    },
  );

  app.delete(
    "/local-games/:filename",
    requireEngineToken,
    deleteRateLimit,
    async (req: Request, res: Response) => {
      try {
        const filenameParam = req.params.filename;
        const result = await deleteVaultGame(
          getVaultOwnerContext(req, getVaultOwnerId),
          Array.isArray(filenameParam) ? filenameParam[0] : filenameParam,
        );
        if (result.status === "invalid") {
          res.status(400).json({ error: "Invalid filename" });
          return;
        }
        if (result.status === "not_found") {
          res.status(404).json({ error: "File not found" });
          return;
        }
        console.log("[Library] Local game deleted");
        res.json({ success: true });
      } catch (error) {
        console.error("Failed to delete file:", error);
        res.status(500).json({ error: "Failed to delete file" });
      }
    },
  );
}
