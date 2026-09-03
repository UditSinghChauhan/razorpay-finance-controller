import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * apps/web ??? Vite config.
 *
 * Proxies /api/* to the ASSAY engine API (apps/api, port 8787).
 *
 * Visual source of truth: Stitch project 9231734352593457361
 *   Command Center      : a6f740ffe62c4bb090d97bb76233faad
 *   Investigation Queue : 4a8912729c14499da36b4110e88de1e2
 *   Evidence Trail      : 407721922edf4f709afa670c7ffa7050
 *   Ambiguity Cert      : ae0661c3d7c84e51ae8263e7b3681dc0
 *
 * Design system: assets/7df82212894c4f6c99c4f2b1e264b84d (Indigo v2)
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Rewrite /api/runs -> /runs so the frontend can use /api as a
      // namespace while apps/api mounts its routes at the root.
      "/api": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
