#!/usr/bin/env node
/**
 * Development script for Electron app
 * Builds main/preload, starts Vite dev server, and launches Electron
 */

import { spawn, exec } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execAsync = promisify(exec);
const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");

async function main() {
  console.log("🔨 Building main process...");
  await execAsync("node scripts/build-main.mjs --dev", { cwd: rootDir });

  console.log("🔨 Building preload process...");
  await execAsync("node scripts/build-preload.mjs --dev", { cwd: rootDir });

  console.log("🚀 Starting Vite dev server...");
  const vite = spawn("pnpm", ["exec", "vite"], {
    cwd: rootDir,
    stdio: ["inherit", "pipe", "inherit"],
    shell: true,
  });

  // Wait for Vite to be ready
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Vite startup timeout")), 30000);

    vite.stdout.on("data", (data) => {
      const str = data.toString();
      process.stdout.write(str);
      if (str.includes("Local:") || str.includes("localhost:5173")) {
        clearTimeout(timeout);
        resolve();
      }
    });

    vite.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });

  // Give Vite a moment to fully initialize
  await new Promise((r) => setTimeout(r, 1000));

  console.log("⚡ Starting Electron...");

  // Build clean env without ELECTRON_RUN_AS_NODE
  // (VSCode sets this which breaks Electron's module system)
  const cleanEnv = { ...process.env };
  delete cleanEnv.ELECTRON_RUN_AS_NODE;

  const electron = spawn("pnpm", ["exec", "electron", "."], {
    cwd: rootDir,
    stdio: "inherit",
    shell: true,
    env: {
      ...cleanEnv,
      NODE_ENV: "development",
      VITE_DEV_SERVER_URL: "http://localhost:5173",
    },
  });

  electron.on("close", (code) => {
    vite.kill();
    process.exit(code ?? 0);
  });

  // Handle Ctrl+C
  process.on("SIGINT", () => {
    vite.kill();
    electron.kill();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
