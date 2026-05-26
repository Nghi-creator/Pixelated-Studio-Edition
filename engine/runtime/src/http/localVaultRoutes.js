const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const { getUserFolder } = require("../roms/localRomStore");

function createLocalVaultUpload(maxRomSizeBytes) {
  const storage = multer.diskStorage({
    destination(req, file, cb) {
      const userId = req.headers["x-user-id"];
      cb(null, getUserFolder(userId));
    },
    filename(req, file, cb) {
      const safeFilename = path.basename(file.originalname || "unknown.nes");
      cb(null, `${Date.now()}-${crypto.randomUUID()}-${safeFilename}`);
    },
  });

  return multer({
    storage,
    limits: {
      fileSize: maxRomSizeBytes,
      files: 1,
    },
    fileFilter(req, file, cb) {
      const safeFilename = path.basename(file.originalname || "");
      if (!safeFilename.toLowerCase().endsWith(".nes")) {
        cb(new Error("Only .nes ROM files are supported"));
        return;
      }

      cb(null, true);
    },
  });
}

function registerLocalVaultRoutes(app, options) {
  const { maxRomSizeBytes, requireEngineToken } = options;
  const upload = createLocalVaultUpload(maxRomSizeBytes);

  app.get("/local-games", requireEngineToken, (req, res) => {
    try {
      const userId = req.headers["x-user-id"];
      const userFolder = getUserFolder(userId);

      const files = fs
        .readdirSync(userFolder)
        .filter((file) => file.toLowerCase().endsWith(".nes"))
        .map((file) => ({
          name: file,
          time: fs.statSync(path.join(userFolder, file)).mtime.getTime(),
        }))
        .sort((a, b) => b.time - a.time)
        .map((f) => f.name);

      res.json(files);
    } catch (err) {
      console.error("Failed to read user directory:", err);
      res.json([]);
    }
  });

  app.post("/upload", requireEngineToken, (req, res) => {
    upload.single("romFile")(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        const message =
          err.code === "LIMIT_FILE_SIZE"
            ? `ROM file is too large. Max size is ${maxRomSizeBytes} bytes.`
            : err.message;
        return res.status(400).json({ error: message });
      }

      if (err) {
        return res.status(400).json({ error: err.message });
      }

      if (!req.file) return res.status(400).json({ error: "No file uploaded" });

      console.log(
        `[Library] New local game added for user: ${req.file.originalname}`,
      );
      res.json({ success: true, filename: req.file.filename });
    });
  });

  app.delete("/local-games/:filename", requireEngineToken, (req, res) => {
    try {
      const userId = req.headers["x-user-id"];
      const userFolder = getUserFolder(userId);
      const decodedName = decodeURIComponent(req.params.filename);
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
  });
}

module.exports = { registerLocalVaultRoutes };
