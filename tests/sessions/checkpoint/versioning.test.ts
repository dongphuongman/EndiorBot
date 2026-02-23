/**
 * Versioning Tests
 *
 * Tests for checkpoint schema versioning and compatibility.
 *
 * @module tests/sessions/checkpoint/versioning
 * @version 1.0.0
 * @date 2026-02-22
 * @status ACTIVE - Sprint 35 Day 5
 * @authority ADR-006 Checkpoint State Model
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  parseVersion,
  isValidVersion,
  formatVersion,
  compareVersions,
  getVersionComparison,
  checkVersionCompatibility,
  getCurrentSchemaVersion,
  incrementVersion,
  getVersionRange,
  isVersionInRange,
  VersionIncompatibleError,
  MigrationError,
} from "../../../src/sessions/checkpoint/versioning.js";
import { CHECKPOINT_SCHEMA_VERSION } from "../../../src/sessions/checkpoint/types.js";

// ============================================================================
// Version Parsing Tests
// ============================================================================

describe("parseVersion", () => {
  it("should parse valid semver version", () => {
    const result = parseVersion("1.2.3");
    expect(result.valid).toBe(true);
    expect(result.major).toBe(1);
    expect(result.minor).toBe(2);
    expect(result.patch).toBe(3);
  });

  it("should parse version with zeros", () => {
    const result = parseVersion("0.0.0");
    expect(result.valid).toBe(true);
    expect(result.major).toBe(0);
    expect(result.minor).toBe(0);
    expect(result.patch).toBe(0);
  });

  it("should parse large version numbers", () => {
    const result = parseVersion("100.200.300");
    expect(result.valid).toBe(true);
    expect(result.major).toBe(100);
    expect(result.minor).toBe(200);
    expect(result.patch).toBe(300);
  });

  it("should reject invalid version format", () => {
    expect(parseVersion("1.2").valid).toBe(false);
    expect(parseVersion("1").valid).toBe(false);
    expect(parseVersion("1.2.3.4").valid).toBe(false);
    expect(parseVersion("v1.2.3").valid).toBe(false);
    expect(parseVersion("").valid).toBe(false);
    expect(parseVersion("unknown").valid).toBe(false);
  });

  it("should reject version with non-numeric parts", () => {
    expect(parseVersion("1.a.3").valid).toBe(false);
    expect(parseVersion("x.y.z").valid).toBe(false);
    expect(parseVersion("1.2.3-beta").valid).toBe(false);
  });
});

describe("isValidVersion", () => {
  it("should return true for valid versions", () => {
    expect(isValidVersion("1.0.0")).toBe(true);
    expect(isValidVersion("0.0.1")).toBe(true);
    expect(isValidVersion("10.20.30")).toBe(true);
  });

  it("should return false for invalid versions", () => {
    expect(isValidVersion("invalid")).toBe(false);
    expect(isValidVersion("1.2")).toBe(false);
    expect(isValidVersion("")).toBe(false);
  });
});

describe("formatVersion", () => {
  it("should format parsed version back to string", () => {
    const parsed = { major: 1, minor: 2, patch: 3, valid: true };
    expect(formatVersion(parsed)).toBe("1.2.3");
  });

  it("should format version with zeros", () => {
    const parsed = { major: 0, minor: 0, patch: 0, valid: true };
    expect(formatVersion(parsed)).toBe("0.0.0");
  });
});

// ============================================================================
// Version Comparison Tests
// ============================================================================

describe("compareVersions", () => {
  it("should return 0 for equal versions", () => {
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
    expect(compareVersions("2.5.3", "2.5.3")).toBe(0);
  });

  it("should compare major versions correctly", () => {
    expect(compareVersions("2.0.0", "1.0.0")).toBe(1);
    expect(compareVersions("1.0.0", "2.0.0")).toBe(-1);
  });

  it("should compare minor versions correctly", () => {
    expect(compareVersions("1.2.0", "1.1.0")).toBe(1);
    expect(compareVersions("1.1.0", "1.2.0")).toBe(-1);
  });

  it("should compare patch versions correctly", () => {
    expect(compareVersions("1.0.2", "1.0.1")).toBe(1);
    expect(compareVersions("1.0.1", "1.0.2")).toBe(-1);
  });

  it("should handle invalid versions as equal", () => {
    expect(compareVersions("invalid", "1.0.0")).toBe(0);
    expect(compareVersions("1.0.0", "invalid")).toBe(0);
    expect(compareVersions("invalid", "invalid")).toBe(0);
  });

  it("should handle complex comparisons", () => {
    expect(compareVersions("1.10.0", "1.9.0")).toBe(1);
    expect(compareVersions("2.0.0", "1.99.99")).toBe(1);
  });
});

describe("getVersionComparison", () => {
  it("should return 'equal' for matching versions", () => {
    expect(getVersionComparison("1.0.0", "1.0.0")).toBe("equal");
  });

  it("should return 'older' when checkpoint is older than code", () => {
    expect(getVersionComparison("1.0.0", "1.1.0")).toBe("older");
    expect(getVersionComparison("0.9.0", "1.0.0")).toBe("older");
  });

  it("should return 'newer' when checkpoint is newer than code", () => {
    expect(getVersionComparison("1.1.0", "1.0.0")).toBe("newer");
    expect(getVersionComparison("2.0.0", "1.0.0")).toBe("newer");
  });

  it("should return 'invalid' for invalid versions", () => {
    expect(getVersionComparison("invalid", "1.0.0")).toBe("invalid");
    expect(getVersionComparison("1.0.0", "invalid")).toBe("invalid");
  });

  it("should use current schema version as default", () => {
    // Compare with current schema version
    const result = getVersionComparison(CHECKPOINT_SCHEMA_VERSION);
    expect(result).toBe("equal");
  });
});

// ============================================================================
// Compatibility Checking Tests
// ============================================================================

describe("checkVersionCompatibility", () => {
  describe("equal versions", () => {
    it("should be compatible when versions match", () => {
      const result = checkVersionCompatibility("1.0.0", "1.0.0");
      expect(result.compatible).toBe(true);
      expect(result.comparison).toBe("equal");
      expect(result.migrationRequired).toBe(false);
      expect(result.migrationPossible).toBe(true);
    });
  });

  describe("older checkpoint (forward migration)", () => {
    it("should allow forward migration within same major version", () => {
      const result = checkVersionCompatibility("1.0.0", "1.1.0");
      expect(result.compatible).toBe(true);
      expect(result.comparison).toBe("older");
      expect(result.migrationRequired).toBe(true);
      expect(result.migrationPossible).toBe(true);
    });

    it("should allow patch-level migration", () => {
      const result = checkVersionCompatibility("1.0.0", "1.0.1");
      expect(result.compatible).toBe(true);
      expect(result.migrationRequired).toBe(true);
    });

    it("should block cross-major migration", () => {
      const result = checkVersionCompatibility("1.0.0", "2.0.0");
      expect(result.compatible).toBe(false);
      expect(result.migrationRequired).toBe(true);
      expect(result.migrationPossible).toBe(false);
      expect(result.message).toContain("Major version mismatch");
    });
  });

  describe("newer checkpoint (blocked per CTO guidance)", () => {
    it("should BLOCK when checkpoint is newer than code", () => {
      const result = checkVersionCompatibility("1.1.0", "1.0.0");
      expect(result.compatible).toBe(false);
      expect(result.comparison).toBe("newer");
      expect(result.migrationRequired).toBe(false);
      expect(result.migrationPossible).toBe(false);
      expect(result.message).toContain("BLOCKED");
    });

    it("should block newer major version", () => {
      const result = checkVersionCompatibility("2.0.0", "1.0.0");
      expect(result.compatible).toBe(false);
      expect(result.comparison).toBe("newer");
      expect(result.message).toContain("Upgrade your EndiorBot installation");
    });

    it("should block newer patch version", () => {
      const result = checkVersionCompatibility("1.0.2", "1.0.1");
      expect(result.compatible).toBe(false);
      expect(result.comparison).toBe("newer");
    });
  });

  describe("invalid versions", () => {
    it("should report invalid version format", () => {
      const result = checkVersionCompatibility("invalid", "1.0.0");
      expect(result.compatible).toBe(false);
      expect(result.comparison).toBe("invalid");
      expect(result.message).toContain("Invalid version format");
    });

    it("should handle unknown version", () => {
      const result = checkVersionCompatibility("unknown", "1.0.0");
      expect(result.compatible).toBe(false);
      expect(result.comparison).toBe("invalid");
    });
  });

  describe("uses current schema version by default", () => {
    it("should use CHECKPOINT_SCHEMA_VERSION when code version not specified", () => {
      const result = checkVersionCompatibility(CHECKPOINT_SCHEMA_VERSION);
      expect(result.compatible).toBe(true);
      expect(result.codeVersion).toBe(CHECKPOINT_SCHEMA_VERSION);
    });
  });
});

// ============================================================================
// Version Utilities Tests
// ============================================================================

describe("getCurrentSchemaVersion", () => {
  it("should return the current schema version", () => {
    expect(getCurrentSchemaVersion()).toBe(CHECKPOINT_SCHEMA_VERSION);
  });
});

describe("incrementVersion", () => {
  it("should increment major version", () => {
    expect(incrementVersion("1.2.3", "major")).toBe("2.0.0");
    expect(incrementVersion("0.5.9", "major")).toBe("1.0.0");
  });

  it("should increment minor version", () => {
    expect(incrementVersion("1.2.3", "minor")).toBe("1.3.0");
    expect(incrementVersion("1.0.0", "minor")).toBe("1.1.0");
  });

  it("should increment patch version", () => {
    expect(incrementVersion("1.2.3", "patch")).toBe("1.2.4");
    expect(incrementVersion("1.0.0", "patch")).toBe("1.0.1");
  });

  it("should return original for invalid version", () => {
    expect(incrementVersion("invalid", "patch")).toBe("invalid");
  });
});

describe("getVersionRange", () => {
  it("should return versions between two versions", () => {
    const range = getVersionRange("1.0.0", "1.0.3");
    expect(range).toContain("1.0.1");
    expect(range).toContain("1.0.2");
    expect(range).toContain("1.0.3");
  });

  it("should return empty for same versions", () => {
    const range = getVersionRange("1.0.0", "1.0.0");
    expect(range).toHaveLength(0);
  });

  it("should return empty for different major versions", () => {
    const range = getVersionRange("1.0.0", "2.0.0");
    expect(range).toHaveLength(0);
  });

  it("should return empty for invalid versions", () => {
    const range = getVersionRange("invalid", "1.0.0");
    expect(range).toHaveLength(0);
  });

  it("should handle minor version increments", () => {
    const range = getVersionRange("1.0.5", "1.1.0");
    expect(range.length).toBeGreaterThan(0);
  });
});

describe("isVersionInRange", () => {
  it("should return true for version within range", () => {
    expect(isVersionInRange("1.0.5", "1.0.0", "1.1.0")).toBe(true);
    expect(isVersionInRange("1.0.0", "1.0.0", "1.1.0")).toBe(true);
    expect(isVersionInRange("1.1.0", "1.0.0", "1.1.0")).toBe(true);
  });

  it("should return false for version outside range", () => {
    expect(isVersionInRange("0.9.0", "1.0.0", "1.1.0")).toBe(false);
    expect(isVersionInRange("1.2.0", "1.0.0", "1.1.0")).toBe(false);
  });

  it("should handle single point range", () => {
    expect(isVersionInRange("1.0.0", "1.0.0", "1.0.0")).toBe(true);
    expect(isVersionInRange("1.0.1", "1.0.0", "1.0.0")).toBe(false);
  });
});

// ============================================================================
// Error Classes Tests
// ============================================================================

describe("VersionIncompatibleError", () => {
  it("should create error with compatibility info", () => {
    const compatibility = checkVersionCompatibility("2.0.0", "1.0.0");
    const error = new VersionIncompatibleError(compatibility);

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("VersionIncompatibleError");
    expect(error.checkpointVersion).toBe("2.0.0");
    expect(error.codeVersion).toBe("1.0.0");
    expect(error.comparison).toBe("newer");
    expect(error.message).toContain("BLOCKED");
  });

  it("should include helpful message", () => {
    const compatibility = checkVersionCompatibility("1.5.0", "1.0.0");
    const error = new VersionIncompatibleError(compatibility);

    expect(error.message).toContain("Upgrade");
  });
});

describe("MigrationError", () => {
  it("should create error with migration info", () => {
    const error = new MigrationError("1.0.0", "1.1.0", "Test failure");

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("MigrationError");
    expect(error.fromVersion).toBe("1.0.0");
    expect(error.toVersion).toBe("1.1.0");
    expect(error.reason).toBe("Test failure");
    expect(error.message).toContain("Migration from v1.0.0 to v1.1.0 failed");
    expect(error.message).toContain("Test failure");
  });
});

// ============================================================================
// CTO Guidance: Forward-Only Migration Tests
// ============================================================================

describe("CTO Guidance: Forward-Only Migration", () => {
  it("should allow forward migration (older → newer)", () => {
    // This is the expected case: old checkpoint, new code
    const result = checkVersionCompatibility("1.0.0", "1.2.0");
    expect(result.compatible).toBe(true);
    expect(result.migrationRequired).toBe(true);
    expect(result.message).toContain("can be migrated");
  });

  it("should BLOCK backward migration (newer → older)", () => {
    // This must be blocked per CTO guidance
    const result = checkVersionCompatibility("1.2.0", "1.0.0");
    expect(result.compatible).toBe(false);
    expect(result.migrationPossible).toBe(false);
    expect(result.message).toContain("BLOCKED");
  });

  it("should prevent silent data corruption on binary rollback", () => {
    // Scenario: CEO rolls back EndiorBot binary from v1.5 to v1.3
    // but has checkpoints saved with schema v1.5.0
    const result = checkVersionCompatibility("1.5.0", "1.3.0");

    expect(result.compatible).toBe(false);
    expect(result.comparison).toBe("newer");
    expect(result.message).toContain("Upgrade your EndiorBot installation");
    expect(result.message).toContain("delete the checkpoint");
  });

  it("should warn and block, not silently attempt downgrade", () => {
    const result = checkVersionCompatibility("2.0.0", "1.0.0");

    // Must NOT be compatible
    expect(result.compatible).toBe(false);

    // Must NOT suggest migration is possible
    expect(result.migrationPossible).toBe(false);

    // Message must be actionable
    expect(result.message.length).toBeGreaterThan(10);
  });
});
