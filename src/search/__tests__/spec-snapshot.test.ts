/**
 * Spec Snapshot Manager Tests
 *
 * Unit tests for the SpecSnapshotManager.
 * Sprint 64: T4.2 - Spec Snapshot file marking.
 *
 * @module search/__tests__/spec-snapshot.test
 * @version 1.0.0
 * @date 2026-03-01
 * @status ACTIVE - Sprint 64
 * @sprint 64
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  SpecSnapshotManager,
  getSpecSnapshotManager,
  resetSpecSnapshotManager,
  loadSpecSnapshotPaths,
  isSpecSourceFile,
  DEFAULT_SPEC_SOURCES,
} from "../spec-snapshot.js";

// ============================================================================
// DEFAULT_SPEC_SOURCES Tests
// ============================================================================

describe("DEFAULT_SPEC_SOURCES", () => {
  it("should include planning docs", () => {
    expect(DEFAULT_SPEC_SOURCES).toContain("docs/01-planning/**/*.md");
  });

  it("should include design docs", () => {
    expect(DEFAULT_SPEC_SOURCES).toContain("docs/02-design/**/*.md");
  });

  it("should include ADRs", () => {
    expect(DEFAULT_SPEC_SOURCES).toContain("ADR-*.md");
  });

  it("should include requirements", () => {
    expect(DEFAULT_SPEC_SOURCES).toContain("**/requirements.md");
  });

  it("should include API definitions", () => {
    expect(DEFAULT_SPEC_SOURCES).toContain("**/api.yaml");
    expect(DEFAULT_SPEC_SOURCES).toContain("**/openapi.yaml");
  });

  it("should include proto files", () => {
    expect(DEFAULT_SPEC_SOURCES).toContain("**/*.proto");
  });

  it("should include type definitions", () => {
    expect(DEFAULT_SPEC_SOURCES).toContain("src/types.ts");
    expect(DEFAULT_SPEC_SOURCES).toContain("src/**/types.ts");
  });
});

// ============================================================================
// SpecSnapshotManager Tests
// ============================================================================

describe("SpecSnapshotManager", () => {
  let tempDir: string;

  beforeEach(async () => {
    // Create temp directory for tests
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "spec-snapshot-test-"));
    resetSpecSnapshotManager();
  });

  afterEach(async () => {
    // Cleanup temp directory
    try {
      await fs.rm(tempDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
    resetSpecSnapshotManager();
  });

  describe("constructor", () => {
    it("should create manager with default cwd", () => {
      const manager = new SpecSnapshotManager();
      expect(manager).toBeInstanceOf(SpecSnapshotManager);
    });

    it("should create manager with custom project root", () => {
      const manager = new SpecSnapshotManager(tempDir);
      expect(manager).toBeInstanceOf(SpecSnapshotManager);
    });
  });

  describe("load", () => {
    it("should use default sources when no config file", async () => {
      const manager = new SpecSnapshotManager(tempDir);
      const config = await manager.load();

      expect(config.sources).toEqual(DEFAULT_SPEC_SOURCES);
    });

    it("should load config from spec_snapshot.yaml", async () => {
      // Create config file
      const configContent = `
id: "sha256:abc123"
sources:
  - docs/spec.md
  - src/api.ts
policy:
  enabled: true
`;
      await fs.writeFile(
        path.join(tempDir, "spec_snapshot.yaml"),
        configContent
      );

      const manager = new SpecSnapshotManager(tempDir);
      const config = await manager.load();

      expect(config.sources).toContain("docs/spec.md");
      expect(config.sources).toContain("src/api.ts");
    });

    it("should load config from spec-snapshot.yml", async () => {
      const configContent = `
sources:
  - custom/source.md
`;
      await fs.writeFile(
        path.join(tempDir, "spec-snapshot.yml"),
        configContent
      );

      const manager = new SpecSnapshotManager(tempDir);
      const config = await manager.load();

      expect(config.sources).toContain("custom/source.md");
    });

    it("should set loaded state", async () => {
      const manager = new SpecSnapshotManager(tempDir);
      expect(manager.isLoaded()).toBe(false);

      await manager.load();

      expect(manager.isLoaded()).toBe(true);
    });
  });

  describe("getSourcePaths", () => {
    it("should return default sources when not loaded", () => {
      const manager = new SpecSnapshotManager(tempDir);
      const paths = manager.getSourcePaths();

      expect(paths).toEqual(DEFAULT_SPEC_SOURCES);
    });

    it("should return loaded sources", async () => {
      const configContent = `
sources:
  - custom/path.md
`;
      await fs.writeFile(
        path.join(tempDir, "spec_snapshot.yaml"),
        configContent
      );

      const manager = new SpecSnapshotManager(tempDir);
      await manager.load();
      const paths = manager.getSourcePaths();

      expect(paths).toContain("custom/path.md");
    });
  });

  describe("getSourcePatterns", () => {
    it("should return patterns from config", async () => {
      const configContent = `
sources:
  - "docs/**/*.md"
  - "src/types.ts"
`;
      await fs.writeFile(
        path.join(tempDir, "spec_snapshot.yaml"),
        configContent
      );

      const manager = new SpecSnapshotManager(tempDir);
      await manager.load();
      const patterns = manager.getSourcePatterns();

      expect(patterns).toContain("docs/**/*.md");
      expect(patterns).toContain("src/types.ts");
    });
  });

  describe("isSpecSource", () => {
    it("should match exact file paths", async () => {
      const configContent = `
sources:
  - docs/requirements.md
`;
      await fs.writeFile(
        path.join(tempDir, "spec_snapshot.yaml"),
        configContent
      );

      const manager = new SpecSnapshotManager(tempDir);
      await manager.load();

      expect(manager.isSpecSource("docs/requirements.md")).toBe(true);
      expect(manager.isSpecSource("docs/other.md")).toBe(false);
    });

    it("should match glob patterns", async () => {
      const configContent = `
sources:
  - "docs/**/*.md"
`;
      await fs.writeFile(
        path.join(tempDir, "spec_snapshot.yaml"),
        configContent
      );

      const manager = new SpecSnapshotManager(tempDir);
      await manager.load();

      expect(manager.isSpecSource("docs/planning/spec.md")).toBe(true);
      expect(manager.isSpecSource("docs/readme.md")).toBe(true);
      expect(manager.isSpecSource("src/code.ts")).toBe(false);
    });

    it("should match wildcard patterns", async () => {
      const configContent = `
sources:
  - "ADR-*.md"
`;
      await fs.writeFile(
        path.join(tempDir, "spec_snapshot.yaml"),
        configContent
      );

      const manager = new SpecSnapshotManager(tempDir);
      await manager.load();

      expect(manager.isSpecSource("ADR-001.md")).toBe(true);
      expect(manager.isSpecSource("ADR-foo.md")).toBe(true);
      expect(manager.isSpecSource("NOTADR.md")).toBe(false);
    });

    it("should use defaults when not loaded", () => {
      const manager = new SpecSnapshotManager(tempDir);

      // Default patterns include ADR-*.md
      expect(manager.isSpecSource("ADR-001.md")).toBe(true);
    });
  });

  describe("getState", () => {
    it("should return null when not loaded", () => {
      const manager = new SpecSnapshotManager(tempDir);
      expect(manager.getState()).toBeNull();
    });

    it("should return state after loading", async () => {
      const manager = new SpecSnapshotManager(tempDir);
      await manager.load();

      const state = manager.getState();
      expect(state).not.toBeNull();
      expect(state?.config).toBeDefined();
      expect(state?.loadedAt).toBeInstanceOf(Date);
      expect(state?.resolvedPaths).toBeDefined();
    });
  });
});

// ============================================================================
// Singleton Functions Tests
// ============================================================================

describe("getSpecSnapshotManager", () => {
  beforeEach(() => {
    resetSpecSnapshotManager();
  });

  afterEach(() => {
    resetSpecSnapshotManager();
  });

  it("should return same instance for same project", () => {
    const manager1 = getSpecSnapshotManager();
    const manager2 = getSpecSnapshotManager();

    expect(manager1).toBe(manager2);
  });

  it("should create new instance for different project", () => {
    const manager1 = getSpecSnapshotManager("/path/one");
    resetSpecSnapshotManager();
    const manager2 = getSpecSnapshotManager("/path/two");

    // They should be different instances after reset
    expect(manager1).not.toBe(manager2);
  });
});

describe("resetSpecSnapshotManager", () => {
  it("should reset the singleton", () => {
    const manager1 = getSpecSnapshotManager();
    resetSpecSnapshotManager();
    const manager2 = getSpecSnapshotManager();

    expect(manager1).not.toBe(manager2);
  });
});

describe("loadSpecSnapshotPaths", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "spec-snapshot-test-"));
    resetSpecSnapshotManager();
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true });
    } catch {
      // Ignore
    }
    resetSpecSnapshotManager();
  });

  it("should load and return paths", async () => {
    const configContent = `
sources:
  - custom/path.md
`;
    await fs.writeFile(path.join(tempDir, "spec_snapshot.yaml"), configContent);

    const paths = await loadSpecSnapshotPaths(tempDir);

    expect(paths).toContain("custom/path.md");
  });

  it("should return defaults when no config", async () => {
    const paths = await loadSpecSnapshotPaths(tempDir);

    expect(paths).toEqual(DEFAULT_SPEC_SOURCES);
  });
});

describe("isSpecSourceFile", () => {
  beforeEach(() => {
    resetSpecSnapshotManager();
  });

  afterEach(() => {
    resetSpecSnapshotManager();
  });

  it("should check using default patterns", () => {
    // ADR-*.md is in default patterns
    expect(isSpecSourceFile("ADR-001.md")).toBe(true);

    // Random files should not match
    expect(isSpecSourceFile("random.txt")).toBe(false);
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe("Spec Snapshot Integration", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "spec-int-test-"));
    resetSpecSnapshotManager();
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true });
    } catch {
      // Ignore
    }
    resetSpecSnapshotManager();
  });

  it("should work end-to-end with config file", async () => {
    // Create config
    const configContent = `
id: "sha256:test123"
sources:
  - docs/01-planning/**/*.md
  - src/core/**/*.ts
  - ADR-*.md
`;
    await fs.writeFile(path.join(tempDir, "spec_snapshot.yaml"), configContent);

    // Load manager
    const manager = new SpecSnapshotManager(tempDir);
    await manager.load();

    // Test various paths
    expect(manager.isSpecSource("docs/01-planning/requirements.md")).toBe(true);
    expect(manager.isSpecSource("docs/01-planning/sub/spec.md")).toBe(true);
    expect(manager.isSpecSource("src/core/engine.ts")).toBe(true);
    expect(manager.isSpecSource("ADR-001.md")).toBe(true);

    // Non-spec paths
    expect(manager.isSpecSource("src/utils/helper.ts")).toBe(false);
    expect(manager.isSpecSource("tests/test.ts")).toBe(false);
    expect(manager.isSpecSource("README.md")).toBe(false);
  });

  it("should parse YAML with quoted strings", async () => {
    const configContent = `
sources:
  - "docs/**/*.md"
  - 'src/types.ts'
`;
    await fs.writeFile(path.join(tempDir, "spec_snapshot.yaml"), configContent);

    const manager = new SpecSnapshotManager(tempDir);
    await manager.load();

    expect(manager.isSpecSource("docs/test.md")).toBe(true);
    expect(manager.isSpecSource("src/types.ts")).toBe(true);
  });

  it("should handle comments in YAML", async () => {
    const configContent = `
# This is a comment
sources:
  - docs/spec.md  # inline comment is NOT supported, kept as-is
  # Another comment
  - src/api.ts
`;
    await fs.writeFile(path.join(tempDir, "spec_snapshot.yaml"), configContent);

    const manager = new SpecSnapshotManager(tempDir);
    await manager.load();

    expect(manager.isSpecSource("src/api.ts")).toBe(true);
  });
});
