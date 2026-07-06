import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.indexOf("node_modules") === -1) return;
          if (
            id.indexOf("react-router-dom") !== -1 ||
            id.indexOf("@remix-run") !== -1
          ) {
            return "router-vendor";
          }
          if (id.indexOf("@supabase") !== -1) {
            return "supabase-vendor";
          }
          if (id.indexOf("lucide-react") !== -1) {
            return "icons-vendor";
          }
          if (
            id.indexOf("react-dom") !== -1 ||
            id.indexOf("react\\") !== -1 ||
            id.indexOf("react/") !== -1
          ) {
            return "react-vendor";
          }
        },
      },
    },
  },
});
