/**
 * Vite Configuration for EndiorBot Desktop
 *
 * @module apps/desktop/vite.config
 * @version 1.0.0
 * @date 2026-02-23
 * @status ACTIVE - Sprint 43 Desktop Foundation
 */

import { defineConfig } from "vite";
import path from "node:path";
import react from "@vitejs/plugin-react";
import electron from "vite-plugin-electron/simple";

export default defineConfig({
  plugins: [
    react(),
    electron({
      main: {
        // Main process entry point
        entry: "electron/main/index.ts",
        vite: {
          build: {
            outDir: "dist-electron/main",
            // Force CommonJS output for Electron main process
            lib: {
              entry: "electron/main/index.ts",
              formats: ["cjs"],
              fileName: () => "index.cjs",
            },
            rollupOptions: {
              // External packages that should be resolved at runtime
              external: [
                "electron",
                "electron-updater",
                "endiorbot", // Core library (workspace dependency)
              ],
            },
          },
        },
      },
      preload: {
        // Preload script
        input: "electron/preload/index.ts",
        vite: {
          build: {
            outDir: "dist-electron/preload",
            lib: {
              entry: "electron/preload/index.ts",
              formats: ["cjs"],
              fileName: () => "index.cjs",
            },
            rollupOptions: {
              external: ["electron"],
            },
          },
        },
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@electron": path.resolve(__dirname, "./electron"),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
  },
});
