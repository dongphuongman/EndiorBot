/**
 * Vite Configuration for EndiorBot Desktop Renderer
 *
 * Note: Main and preload processes are built separately using esbuild
 * See scripts/build-main.mjs and scripts/build-preload.mjs
 *
 * @module apps/desktop/vite.config
 * @version 1.0.0
 * @date 2026-02-23
 * @status ACTIVE - Sprint 43 Desktop Foundation
 */

import { defineConfig } from "vite";
import path from "node:path";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
