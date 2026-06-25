import crypto from "crypto";
import fs from "fs";
import path from "path";
import type { Express, Request, RequestHandler, Response } from "express";
import { getUserFolder } from "../roms/localRomStore";
import { getSupportedExtensions } from "../runtime/runtimeRegistry";

const multer = require("multer");

type MulterError = Error & {
  code?: string;
};

type MulterFile = {
  filename: string;
  originalname: string;
};

type RequestWithFile = Request & {
  file?: MulterFile;
};

type LocalVaultRouteOptions = {
  maxRomSizeBytes: number;
  requireEngineToken: RequestHandler;
};

function createLocalVaultUpload(maxRomSizeBytes: number) {
  const supportedExtensions = getSupportedExtensions();
  const storage = multer.diskStorage({
    destination(req: Request, file: MulterFile, cb: (err: Error | null, destination: string) => void) {
      const userId = req.headers["x-user-id"];
      cb(null, getUserFolder(userId));
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
  const { maxRomSizeBytes, requireEngineToken } = options;
  const upload = createLocalVaultUpload(maxRomSizeBytes);
  const supportedExtensions = getSupportedExtensions();

  app.get("/local-games", requireEngineToken, (req: Request, res: Response) => {
    try {
      const userId = req.headers["x-user-id"];
      const userFolder = getUserFolder(userId);

      const files = fs
        .readdirSync(userFolder)
        .filter((file) => {
          const lowerFilename = file.toLowerCase();
          return supportedExtensions.some((extension) =>
            lowerFilename.endsWith(extension),
          );
        })
        .map((file) => ({
          name: file,
          time: fs.statSync(path.join(userFolder, file)).mtime.getTime(),
        }))
        .sort((a, b) => b.time - a.time)
        .map((file) => file.name);

      res.json(files);
    } catch (err) {
      console.error("Failed to read user directory:", err);
      res.json([]);
    }
  });

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

      console.log(
        `[Library] New local game added for user: ${uploadRequest.file.originalname}`,
      );
      res.json({ success: true, filename: uploadRequest.file.filename });
    });
  });

  app.delete(
    "/local-games/:filename",
    requireEngineToken,
    (req: Request, res: Response) => {
      try {
        const userId = req.headers["x-user-id"];
        const userFolder = getUserFolder(userId);
        const filenameParam = req.params.filename;
        const decodedName = decodeURIComponent(
          Array.isArray(filenameParam) ? filenameParam[0] : filenameParam,
        );
        const safeName = path.basename(decodedName);
        const filePath = path.join(userFolder, safeName);

        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
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
