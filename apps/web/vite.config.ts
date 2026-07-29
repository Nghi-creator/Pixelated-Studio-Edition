import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

if (
  process.env.VERCEL_ENV === "production" &&
  !process.env.VITE_TURNSTILE_SITE_KEY?.trim()
) {
  throw new Error(
    "Production web builds require VITE_TURNSTILE_SITE_KEY so anonymous signup cannot bypass CAPTCHA.",
  );
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("@supabase")) return "supabase";
          if (id.includes("socket.io-client") || id.includes("engine.io-client")) {
            return "realtime";
          }
          if (id.includes("lucide-react") || id.includes("react-icons")) {
            return "icons";
          }
          return "vendor";
        },
      },
    },
  },
});
