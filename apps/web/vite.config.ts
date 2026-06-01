import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

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
