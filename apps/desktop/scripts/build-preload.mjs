#!/usr/bin/env node
/**
 * Build script for Electron preload process
 */

import { build } from "esbuild";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");

const isDev = process.argv.includes("--dev");

await build({
  entryPoints: [resolve(rootDir, "electron/preload/index.ts")],
  bundle: true,
  platform: "node",
  target: "node20",
  outfile: resolve(rootDir, "dist-electron/preload/index.js"),
  format: "cjs",
  sourcemap: isDev,
  minify: !isDev,
  external: ["electron"],
  define: {
    "process.env.NODE_ENV": isDev ? '"development"' : '"production"',
  },
  logLevel: "info",
});

console.log("✅ Preload process built successfully");
