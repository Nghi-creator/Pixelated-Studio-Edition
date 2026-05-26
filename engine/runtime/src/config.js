const path = require("path");

const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://pixelated-studio-edition.vercel.app",
];

const allowedOrigins = (
  process.env.PIXELATED_ALLOWED_ORIGINS || DEFAULT_ALLOWED_ORIGINS.join(",")
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error(`Origin not allowed by CORS: ${origin}`));
  },
  methods: ["GET", "POST", "DELETE"],
};

const MAX_ROM_SIZE_BYTES = Number(
  process.env.PIXELATED_MAX_ROM_SIZE_BYTES || 8 * 1024 * 1024,
);

const MAX_CLOUD_ROM_SIZE_BYTES = Number(
  process.env.PIXELATED_MAX_CLOUD_ROM_SIZE_BYTES || 8 * 1024 * 1024,
);

const CLOUD_ROM_DOWNLOAD_TIMEOUT_MS = Number(
  process.env.PIXELATED_CLOUD_ROM_DOWNLOAD_TIMEOUT_MS || 15000,
);

const ENGINE_TOKEN = process.env.PIXELATED_ENGINE_TOKEN || "";

const allowedRomHosts = (process.env.PIXELATED_ALLOWED_ROM_HOSTS || "")
  .split(",")
  .map((host) => host.trim().toLowerCase())
  .filter(Boolean);

const HEALTH_PATHS = {
  cameraBridge: path.join(__dirname, "..", "camera.py"),
  mesenCore: "/cores/mesen_libretro.so",
  retroarchConfig: "/app/retroarch.cfg",
  retroarchBinary: "/usr/bin/retroarch",
  roms: "/roms",
  xvfbSocket: "/tmp/.X11-unix/X99",
  pythonBinary: "/usr/bin/python3",
  gstreamerBinary: "/usr/bin/gst-launch-1.0",
};

module.exports = {
  allowedOrigins,
  allowedRomHosts,
  CLOUD_ROM_DOWNLOAD_TIMEOUT_MS,
  corsOptions,
  ENGINE_TOKEN,
  HEALTH_PATHS,
  MAX_CLOUD_ROM_SIZE_BYTES,
  MAX_ROM_SIZE_BYTES,
};
