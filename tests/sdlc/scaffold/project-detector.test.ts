/**
 * Project Detector Tests
 *
 * Unit tests for project state detection.
 *
 * @module tests/sdlc/scaffold/project-detector
 * @version 1.0.0
 * @date 2026-03-01
 * @status ACTIVE - Sprint 61
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  detectProject,
  isEndiorBotProject,
  needsMigration,
  isFreshProject,
} from "../../../src/sdlc/scaffold/project-detector.js";

// ============================================================================
// Test Setup
// ============================================================================

const TEST_DIR = join(tmpdir(), "endiorbot-detector-test-" + Date.now());

beforeEach(() => {
  if (!existsSync(TEST_DIR)) {
    mkdirSync(TEST_DIR, { recursive: true });
  }
});

afterEach(() => {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
});

// ============================================================================
// detectProject Tests - Fresh Project
// ============================================================================

describe("detectProject - Fresh Project", () => {
  it("should detect FRESH state for empty directory", () => {
    const result = detectProject(TEST_DIR);
    expect(result.state).toBe("FRESH");
    expect(result.existingFiles).toEqual([]);
  });

  it("should include missingFiles for fresh project", () => {
    const result = detectProject(TEST_DIR);
    expect(result.missingFiles).toBeDefined();
    expect(result.missingFiles.length).toBeGreaterThan(0);
    expect(result.missingFiles).toContain(".sdlc-config.json");
  });
});

// ============================================================================
// detectProject Tests - EndiorBot Project
// ============================================================================

describe("detectProject - EndiorBot Project", () => {
  it("should detect ENDIORBOT state from config", () => {
    const config = {
      schema_version: "1.0.0",
      generator: "endiorbot",
      tier: "STANDARD",
    };
    writeFileSync(
      join(TEST_DIR, ".sdlc-config.json"),
      JSON.stringify(config)
    );

    const result = detectProject(TEST_DIR);
    expect(result.state).toBe("ENDIORBOT");
    expect(result.generator).toBe("endiorbot");
    expect(result.configTier).toBe("STANDARD");
  });

  it("should extract version from config", () => {
    const config = {
      schema_version: "2.0.0",
      generator: "endiorbot",
      tier: "PROFESSIONAL",
    };
    writeFileSync(
      join(TEST_DIR, ".sdlc-config.json"),
      JSON.stringify(config)
    );

    const result = detectProject(TEST_DIR);
    expect(result.generatorVersion).toBe("2.0.0");
  });
});

// ============================================================================
// detectProject Tests - SDLC Orchestrator Project
// ============================================================================

describe("detectProject - SDLC Orchestrator Project", () => {
  it("should detect SDLC_ORCHESTRATOR state", () => {
    const config = {
      generator: "sdlc-orchestrator",
      version: "3.0.0",
    };
    writeFileSync(
      join(TEST_DIR, ".sdlc-config.json"),
      JSON.stringify(config)
    );

    const result = detectProject(TEST_DIR);
    expect(result.state).toBe("SDLC_ORCHESTRATOR");
  });
});

// ============================================================================
// detectProject Tests - TinySDLC Project
// ============================================================================

describe("detectProject - TinySDLC Project", () => {
  it("should detect TINYSDLC state from nested config", () => {
    const config = {
      sdlc: {
        frameworkVersion: "6.1.1",
        tier: "lite",
      },
    };
    writeFileSync(
      join(TEST_DIR, ".sdlc-config.json"),
      JSON.stringify(config)
    );

    const result = detectProject(TEST_DIR);
    expect(result.state).toBe("TINYSDLC");
    expect(result.configTier).toBe("LITE");
  });
});

// ============================================================================
// detectProject Tests - Partial Project
// ============================================================================

describe("detectProject - Partial Project", () => {
  it("should detect PARTIAL state when docs/ exists without config", () => {
    const docsDir = join(TEST_DIR, "docs");
    mkdirSync(docsDir);
    mkdirSync(join(docsDir, "00-foundation"));
    mkdirSync(join(docsDir, "01-planning"));

    const result = detectProject(TEST_DIR);
    expect(result.state).toBe("PARTIAL");
    expect(result.existingFiles).toContain("docs/");
  });

  it("should detect tier from existing docs/ structure", () => {
    const docsDir = join(TEST_DIR, "docs");
    mkdirSync(docsDir);
    mkdirSync(join(docsDir, "00-foundation"));
    mkdirSync(join(docsDir, "01-planning"));
    mkdirSync(join(docsDir, "02-design"));

    const result = detectProject(TEST_DIR);
    expect(result.state).toBe("PARTIAL");
    expect(result.structureTier).toBeDefined();
  });
});

// ============================================================================
// detectProject Tests - Unknown Config
// ============================================================================

describe("detectProject - Unknown Config", () => {
  it("should detect UNKNOWN state for unrecognized config format", () => {
    const config = {
      someOtherTool: true,
      randomField: "value",
    };
    writeFileSync(
      join(TEST_DIR, ".sdlc-config.json"),
      JSON.stringify(config)
    );

    const result = detectProject(TEST_DIR);
    expect(result.state).toBe("UNKNOWN");
  });

  it("should handle malformed JSON gracefully", () => {
    writeFileSync(
      join(TEST_DIR, ".sdlc-config.json"),
      "{ invalid json }"
    );

    const result = detectProject(TEST_DIR);
    expect(result.state).toBe("UNKNOWN");
  });
});

// ============================================================================
// detectProject Tests - Existing Files
// ============================================================================

describe("detectProject - Existing Files Detection", () => {
  it("should detect CLAUDE.md", () => {
    writeFileSync(join(TEST_DIR, "CLAUDE.md"), "# CLAUDE.md");

    const result = detectProject(TEST_DIR);
    expect(result.existingFiles).toContain("CLAUDE.md");
  });

  it("should detect IDENTITY.md", () => {
    writeFileSync(join(TEST_DIR, "IDENTITY.md"), "# IDENTITY.md");

    const result = detectProject(TEST_DIR);
    expect(result.existingFiles).toContain("IDENTITY.md");
  });

  it("should detect AGENTS.md", () => {
    writeFileSync(join(TEST_DIR, "AGENTS.md"), "# AGENTS.md");

    const result = detectProject(TEST_DIR);
    expect(result.existingFiles).toContain("AGENTS.md");
  });

  it("should detect .claude/ directory", () => {
    mkdirSync(join(TEST_DIR, ".claude"));

    const result = detectProject(TEST_DIR);
    expect(result.existingFiles).toContain(".claude/");
  });

  it("should detect stage directories in docs/", () => {
    const docsDir = join(TEST_DIR, "docs");
    mkdirSync(docsDir);
    mkdirSync(join(docsDir, "00-foundation"));
    mkdirSync(join(docsDir, "04-build"));

    const result = detectProject(TEST_DIR);
    expect(result.existingFiles).toContain("docs/");
    expect(result.existingFiles).toContain("docs/00-foundation/");
    expect(result.existingFiles).toContain("docs/04-build/");
  });
});

// ============================================================================
// isEndiorBotProject Tests
// ============================================================================

describe("isEndiorBotProject", () => {
  it("should return true for EndiorBot project", () => {
    const config = {
      generator: "endiorbot",
      schema_version: "1.0.0",
    };
    writeFileSync(
      join(TEST_DIR, ".sdlc-config.json"),
      JSON.stringify(config)
    );

    expect(isEndiorBotProject(TEST_DIR)).toBe(true);
  });

  it("should return false for other projects", () => {
    expect(isEndiorBotProject(TEST_DIR)).toBe(false);
  });
});

// ============================================================================
// needsMigration Tests
// ============================================================================

describe("needsMigration", () => {
  it("should return true for TinySDLC project", () => {
    const config = {
      sdlc: {
        frameworkVersion: "6.1.1",
      },
    };
    writeFileSync(
      join(TEST_DIR, ".sdlc-config.json"),
      JSON.stringify(config)
    );

    expect(needsMigration(TEST_DIR)).toBe(true);
  });

  it("should return true for SDLC Orchestrator project", () => {
    const config = {
      generator: "sdlc-orchestrator",
    };
    writeFileSync(
      join(TEST_DIR, ".sdlc-config.json"),
      JSON.stringify(config)
    );

    expect(needsMigration(TEST_DIR)).toBe(true);
  });

  it("should return false for EndiorBot project", () => {
    const config = {
      generator: "endiorbot",
    };
    writeFileSync(
      join(TEST_DIR, ".sdlc-config.json"),
      JSON.stringify(config)
    );

    expect(needsMigration(TEST_DIR)).toBe(false);
  });

  it("should return false for fresh project", () => {
    expect(needsMigration(TEST_DIR)).toBe(false);
  });
});

// ============================================================================
// isFreshProject Tests
// ============================================================================

describe("isFreshProject", () => {
  it("should return true for empty directory", () => {
    expect(isFreshProject(TEST_DIR)).toBe(true);
  });

  it("should return false when config exists", () => {
    writeFileSync(
      join(TEST_DIR, ".sdlc-config.json"),
      JSON.stringify({ generator: "endiorbot" })
    );

    expect(isFreshProject(TEST_DIR)).toBe(false);
  });

  it("should return false when docs/ exists", () => {
    const docsDir = join(TEST_DIR, "docs");
    mkdirSync(docsDir);
    mkdirSync(join(docsDir, "00-foundation"));

    expect(isFreshProject(TEST_DIR)).toBe(false);
  });
});
