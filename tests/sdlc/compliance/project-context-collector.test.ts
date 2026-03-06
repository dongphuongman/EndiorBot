/**
 * Project Context Collector Tests
 *
 * @module tests/sdlc/compliance/project-context-collector
 * @sprint 79
 * @authority ADR-022
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { collectProjectContext } from "../../../src/sdlc/compliance/project-context-collector.js";

// ============================================================================
// Test helpers
// ============================================================================

function makeTmpDir(): string {
  const dir = join(tmpdir(), `endiorbot-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeFile(dir: string, relPath: string, content: string): void {
  const fullPath = join(dir, relPath);
  mkdirSync(join(dir, relPath, ".."), { recursive: true });
  writeFileSync(fullPath, content, "utf-8");
}

function writeJson(dir: string, relPath: string, obj: unknown): void {
  writeFile(dir, relPath, JSON.stringify(obj, null, 2));
}

// ============================================================================
// Tests: bun.lock text format (Bun 1.2+)
// ============================================================================

describe("project-context-collector — Bun detection", () => {
  let tmpDir: string;

  beforeEach(() => { tmpDir = makeTmpDir(); });
  afterEach(() => { if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true }); });

  it("detects Bun via legacy bun.lockb binary", async () => {
    writeJson(tmpDir, "package.json", { name: "test", dependencies: {} });
    writeFile(tmpDir, "bun.lockb", "binary-stub");
    const snapshot = await collectProjectContext(tmpDir, "STANDARD");
    expect(snapshot.techStack.packageManager).toBe("bun");
  });

  it("detects Bun via text-format bun.lock (Bun 1.2+)", async () => {
    writeJson(tmpDir, "package.json", { name: "test", dependencies: {} });
    writeFile(tmpDir, "bun.lock", "# Bun lockfile v1\n");
    const snapshot = await collectProjectContext(tmpDir, "STANDARD");
    expect(snapshot.techStack.packageManager).toBe("bun");
  });

  it("detects pnpm when pnpm-lock.yaml present (not bun)", async () => {
    writeJson(tmpDir, "package.json", { name: "test", dependencies: {} });
    writeFile(tmpDir, "pnpm-lock.yaml", "lockfileVersion: '6.0'");
    const snapshot = await collectProjectContext(tmpDir, "STANDARD");
    expect(snapshot.techStack.packageManager).toBe("pnpm");
  });
});

// ============================================================================
// Tests: Tauri 2 detection
// ============================================================================

describe("project-context-collector — Tauri detection", () => {
  let tmpDir: string;

  beforeEach(() => { tmpDir = makeTmpDir(); });
  afterEach(() => { if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true }); });

  it("detects Tauri 2 via @tauri-apps/api dependency", async () => {
    writeJson(tmpDir, "package.json", {
      name: "test",
      dependencies: { "@tauri-apps/api": "^2.0.0" },
    });
    const snapshot = await collectProjectContext(tmpDir, "STANDARD");
    expect(snapshot.techStack.desktop).toBe("Tauri 2");
  });

  it("detects Tauri 2 via @tauri-apps/cli devDependency", async () => {
    writeJson(tmpDir, "package.json", {
      name: "test",
      dependencies: {},
      devDependencies: { "@tauri-apps/cli": "^2.0.0" },
    });
    const snapshot = await collectProjectContext(tmpDir, "STANDARD");
    expect(snapshot.techStack.desktop).toBe("Tauri 2");
  });

  it("does NOT set desktop for non-Tauri projects", async () => {
    writeJson(tmpDir, "package.json", {
      name: "test",
      dependencies: { "express": "^4.0.0" },
    });
    const snapshot = await collectProjectContext(tmpDir, "STANDARD");
    expect(snapshot.techStack.desktop).toBeUndefined();
  });
});

// ============================================================================
// Tests: Vue/Vite framework enrichment
// ============================================================================

describe("project-context-collector — Vue/Vite detection", () => {
  let tmpDir: string;

  beforeEach(() => { tmpDir = makeTmpDir(); });
  afterEach(() => { if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true }); });

  it("detects 'Vue' alone when no Vite", async () => {
    writeJson(tmpDir, "package.json", {
      name: "test",
      dependencies: { "vue": "^3.0.0" },
    });
    const snapshot = await collectProjectContext(tmpDir, "STANDARD");
    expect(snapshot.techStack.framework).toBe("Vue");
  });

  it("detects 'Vue/Vite' when vue + vite present", async () => {
    writeJson(tmpDir, "package.json", {
      name: "test",
      dependencies: { "vue": "^3.0.0", "vite": "^5.0.0" },
    });
    const snapshot = await collectProjectContext(tmpDir, "STANDARD");
    expect(snapshot.techStack.framework).toBe("Vue/Vite");
  });

  it("detects 'Vue/Vite' when vue + @vitejs/plugin-vue present", async () => {
    writeJson(tmpDir, "package.json", {
      name: "test",
      dependencies: { "vue": "^3.0.0" },
      devDependencies: { "@vitejs/plugin-vue": "^5.0.0" },
    });
    const snapshot = await collectProjectContext(tmpDir, "STANDARD");
    expect(snapshot.techStack.framework).toBe("Vue/Vite");
  });

  it("detects React separately from Vue", async () => {
    writeJson(tmpDir, "package.json", {
      name: "test",
      dependencies: { "react": "^18.0.0" },
    });
    const snapshot = await collectProjectContext(tmpDir, "STANDARD");
    expect(snapshot.techStack.framework).toBe("React");
    expect(snapshot.techStack.framework).not.toContain("Vue");
  });
});

// ============================================================================
// Tests: open-pencil combined scenario
// ============================================================================

describe("project-context-collector — open-pencil full scenario", () => {
  let tmpDir: string;

  beforeEach(() => { tmpDir = makeTmpDir(); });
  afterEach(() => { if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true }); });

  it("correctly identifies open-pencil stack (TypeScript + Vue/Vite + Bun + Tauri 2)", async () => {
    writeJson(tmpDir, "package.json", {
      name: "open-pencil",
      description: "A design tool",
      dependencies: {
        "vue": "^3.4.0",
        "@tauri-apps/api": "^2.1.0",
      },
      devDependencies: {
        "vite": "^5.0.0",
        "@vitejs/plugin-vue": "^5.0.0",
        "vitest": "^1.0.0",
      },
      scripts: {
        dev: "vite",
        build: "vite build",
        test: "vitest run",
      },
    });
    writeFile(tmpDir, "tsconfig.json", '{"compilerOptions":{}}');
    writeFile(tmpDir, "bun.lock", "# Bun lockfile v1\n");

    const snapshot = await collectProjectContext(tmpDir, "STANDARD");

    expect(snapshot.name).toBe("open-pencil");
    expect(snapshot.techStack.language).toBe("TypeScript");
    expect(snapshot.techStack.framework).toBe("Vue/Vite");
    expect(snapshot.techStack.packageManager).toBe("bun");
    expect(snapshot.techStack.desktop).toBe("Tauri 2");
    expect(snapshot.techStack.hasTypeScript).toBe(true);
  });
});
