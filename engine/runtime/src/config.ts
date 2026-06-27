import path from "path";

const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://pixelated-studio-edition.vercel.app",
];

export function normalizeOrigin(origin: string) {
  const trimmed = origin.trim();
  if (!trimmed) return "";

  try {
    return new URL(trimmed).origin;
  } catch {
    return trimmed.replace(/\/+$/, "");
  }
}

export const allowedOrigins = (
  process.env.PIXELATED_ALLOWED_ORIGINS || DEFAULT_ALLOWED_ORIGINS.join(",")
)
  .split(",")
  .map(normalizeOrigin)
  .filter(Boolean);

export const corsOptions = {
  origin(origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
    if (!origin || allowedOrigins.includes(normalizeOrigin(origin))) {
      callback(null, true);
      return;
    }

    const error = new Error(`Origin not allowed by CORS: ${origin}`) as Error & {
      statusCode: number;
    };
    error.statusCode = 403;
    callback(error);
  },
  methods: ["GET", "POST", "DELETE"],
};

export const MAX_ROM_SIZE_BYTES = Number(
  process.env.PIXELATED_MAX_ROM_SIZE_BYTES || 64 * 1024 * 1024,
);

export const MAX_CLOUD_ROM_SIZE_BYTES = Number(
  process.env.PIXELATED_MAX_CLOUD_ROM_SIZE_BYTES || 32 * 1024 * 1024,
);

export const CLOUD_ROM_DOWNLOAD_TIMEOUT_MS = Number(
  process.env.PIXELATED_CLOUD_ROM_DOWNLOAD_TIMEOUT_MS || 15000,
);

export const ENGINE_TOKEN = process.env.PIXELATED_ENGINE_TOKEN || "";
export const PIXELATED_API_URL = (process.env.PIXELATED_API_URL || "").replace(
  /\/+$/,
  "",
);
export const ENGINE_EXPOSURE_MODE =
  process.env.PIXELATED_ENGINE_EXPOSURE_MODE === "lan" ? "lan" : "local";
export const ENGINE_RUNTIME_KIND =
  process.env.PIXELATED_ENGINE_RUNTIME_KIND === "native_linux"
    ? "native_linux"
    : "libretro";
export const ADVERTISED_URLS = (process.env.PIXELATED_ADVERTISED_URLS || "")
  .split(",")
  .map((url) => url.trim())
  .filter(Boolean);
export const COMPANION_URLS = (process.env.PIXELATED_COMPANION_URLS || "")
  .split(",")
  .map((url) => url.trim())
  .filter(Boolean);

export const allowedRomHosts = (process.env.PIXELATED_ALLOWED_ROM_HOSTS || "")
  .split(",")
  .map((host) => host.trim().toLowerCase())
  .filter(Boolean);

export const HEALTH_PATHS = {
  cameraBridge: path.join(process.cwd(), "camera.py"),
  cameraPeerState: "/tmp/pixelated_camera_peers.json",
  gamepadBridge: path.join(process.cwd(), "input_gamepad.py"),
  gstreamerBinary: "/usr/bin/gst-launch-1.0",
  libretroCores: [
    "/cores/mesen_libretro.so",
    "/cores/mgba_libretro.so",
    "/cores/bsnes_libretro.so",
    "/cores/picodrive_libretro.so",
  ],
  pythonBinary: "/usr/bin/python3",
  retroarchBinary: "/usr/bin/retroarch",
  retroarchConfig: "/app/retroarch.cfg",
  roms: "/roms",
  xvfbSocket: "/tmp/.X11-unix/X99",
};
