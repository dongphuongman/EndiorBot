#!/usr/bin/env node
/**
 * Build script for Electron main process
 * Uses esbuild with electron as external to preserve Electron's module interception
 */

import { build } from "esbuild";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");

const isDev = process.argv.includes("--dev");

await build({
  entryPoints: [resolve(rootDir, "electron/main/index.ts")],
  bundle: true,
  platform: "node",
  target: "node20",
  outfile: resolve(rootDir, "dist-electron/main/index.js"),
  format: "cjs",
  sourcemap: isDev,
  minify: !isDev,
  // Mark electron and node built-ins as external
  external: [
    "electron",
    "original-fs", // Electron's patched fs
    "keytar", // Native module for credential management
    "endiorbot", // CLI package (workspace dependency)
  ],
  // Use loader for .node files
  loader: {
    ".node": "file",
  },
  // Handle node: protocol imports
  alias: {
    "node:path": "path",
    "node:fs": "fs",
    "node:os": "os",
    "node:url": "url",
    "node:util": "util",
    "node:crypto": "crypto",
    "node:assert": "assert",
    "node:events": "events",
    "node:stream": "stream",
    "node:process": "process",
  },
  // Define for environment
  define: {
    "process.env.NODE_ENV": isDev ? '"development"' : '"production"',
  },
  logLevel: "info",
});

console.log("✅ Main process built successfully");
