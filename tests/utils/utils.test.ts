/**
 * EndiorBot Utils Tests
 *
 * Unit tests for utility functions.
 *
 * @module tests/utils
 * @version 1.0.0
 * @date 2026-02-22
 * @status ACTIVE - Sprint 33 Day 6-7
 */

import { describe, it, expect } from "vitest";
import {
  // String utilities
  truncate,
  capitalize,
  camelCase,
  kebabCase,
  snakeCase,
  slugify,
  isBlank,
  isNotBlank,
  indent,
  dedent,
  pluralize,
  escapeHtml,
  // JSON utilities
  safeJsonParse,
  parseJsonOrDefault,
  prettyJson,
  deepMerge,
  getByPath,
  setByPath,
  deepEqual,
  isPlainObject,
  // Hash utilities
  sha256,
  md5,
  hmac,
  verifyHmac,
  uuid,
  isUuid,
  shortHash,
  randomHex,
  randomAlphanumeric,
  // Time utilities
  toDateString,
  toTimeString,
  parseDuration,
  formatDuration,
  formatRelativeTime,
  MS_PER_HOUR,
  MS_PER_DAY,
} from "../../src/utils/index.js";

// ============================================================================
// String Utilities
// ============================================================================

describe("String Utilities", () => {
  describe("truncate", () => {
    it("should not truncate short strings", () => {
      expect(truncate("hello", { length: 10 })).toBe("hello");
    });

    it("should truncate long strings with ellipsis", () => {
      expect(truncate("hello world", { length: 8 })).toBe("hello...");
    });

    it("should use custom suffix", () => {
      expect(truncate("hello world", { length: 8, suffix: "…", wordBoundary: false })).toBe("hello w…");
    });
  });

  describe("capitalize", () => {
    it("should capitalize first letter", () => {
      expect(capitalize("hello")).toBe("Hello");
    });

    it("should handle empty string", () => {
      expect(capitalize("")).toBe("");
    });
  });

  describe("case conversions", () => {
    it("camelCase should convert strings", () => {
      expect(camelCase("hello-world")).toBe("helloWorld");
      expect(camelCase("hello_world")).toBe("helloWorld");
      expect(camelCase("Hello World")).toBe("helloWorld");
    });

    it("kebabCase should convert strings", () => {
      expect(kebabCase("helloWorld")).toBe("hello-world");
      expect(kebabCase("HelloWorld")).toBe("hello-world");
    });

    it("snakeCase should convert strings", () => {
      expect(snakeCase("helloWorld")).toBe("hello_world");
      expect(snakeCase("hello-world")).toBe("hello_world");
    });
  });

  describe("slugify", () => {
    it("should create URL-safe slugs", () => {
      expect(slugify("Hello World!")).toBe("hello-world");
      expect(slugify("Xin chào")).toBe("xin-chao");
    });

    it("should respect maxLength", () => {
      const slug = slugify("This is a very long title", { maxLength: 10 });
      expect(slug.length).toBeLessThanOrEqual(10);
    });
  });

  describe("isBlank / isNotBlank", () => {
    it("should detect blank strings", () => {
      expect(isBlank("")).toBe(true);
      expect(isBlank("   ")).toBe(true);
      expect(isBlank(null)).toBe(true);
      expect(isBlank(undefined)).toBe(true);
    });

    it("should detect non-blank strings", () => {
      expect(isNotBlank("hello")).toBe(true);
      expect(isNotBlank("  hello  ")).toBe(true);
      expect(isNotBlank("")).toBe(false);
    });
  });

  describe("indent / dedent", () => {
    it("should indent lines", () => {
      expect(indent("line1\nline2", 2)).toBe("  line1\n  line2");
    });

    it("should dedent lines", () => {
      expect(dedent("  line1\n  line2")).toBe("line1\nline2");
    });
  });

  describe("pluralize", () => {
    it("should pluralize correctly", () => {
      expect(pluralize(1, "file")).toBe("1 file");
      expect(pluralize(5, "file")).toBe("5 files");
      expect(pluralize(0, "child", "children")).toBe("0 children");
    });
  });

  describe("escapeHtml", () => {
    it("should escape HTML special characters", () => {
      expect(escapeHtml("<script>alert('xss')</script>")).toBe(
        "&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;",
      );
    });
  });
});

// ============================================================================
// JSON Utilities
// ============================================================================

describe("JSON Utilities", () => {
  describe("safeJsonParse", () => {
    it("should parse valid JSON", () => {
      const result = safeJsonParse('{"name": "test"}');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toEqual({ name: "test" });
      }
    });

    it("should handle invalid JSON", () => {
      const result = safeJsonParse("invalid json");
      expect(result.ok).toBe(false);
    });
  });

  describe("parseJsonOrDefault", () => {
    it("should return parsed value on success", () => {
      expect(parseJsonOrDefault('{"a": 1}', {})).toEqual({ a: 1 });
    });

    it("should return default on failure", () => {
      expect(parseJsonOrDefault("invalid", { default: true })).toEqual({ default: true });
    });
  });

  describe("prettyJson", () => {
    it("should format JSON with indentation", () => {
      const result = prettyJson({ a: 1 });
      expect(result).toContain("\n");
    });
  });

  describe("deepMerge", () => {
    it("should merge nested objects", () => {
      const result = deepMerge({ a: { b: 1, c: 2 } }, { a: { c: 3, d: 4 } });
      expect(result).toEqual({ a: { b: 1, c: 3, d: 4 } });
    });
  });

  describe("getByPath / setByPath", () => {
    it("should get nested values", () => {
      const obj = { a: { b: { c: 1 } } };
      expect(getByPath(obj, "a.b.c")).toBe(1);
      expect(getByPath(obj, "a.b.x", 0)).toBe(0);
    });

    it("should set nested values", () => {
      const obj = { a: { b: 1 } };
      setByPath(obj, "a.c", 2);
      expect(obj).toEqual({ a: { b: 1, c: 2 } });
    });
  });

  describe("deepEqual", () => {
    it("should compare values deeply", () => {
      expect(deepEqual({ a: { b: 1 } }, { a: { b: 1 } })).toBe(true);
      expect(deepEqual({ a: { b: 1 } }, { a: { b: 2 } })).toBe(false);
      expect(deepEqual([1, 2, 3], [1, 2, 3])).toBe(true);
    });
  });

  describe("isPlainObject", () => {
    it("should detect plain objects", () => {
      expect(isPlainObject({})).toBe(true);
      expect(isPlainObject({ a: 1 })).toBe(true);
      expect(isPlainObject([])).toBe(false);
      expect(isPlainObject(null)).toBe(false);
    });
  });
});

// ============================================================================
// Hash Utilities
// ============================================================================

describe("Hash Utilities", () => {
  describe("sha256", () => {
    it("should generate consistent hashes", () => {
      const hash1 = sha256("hello");
      const hash2 = sha256("hello");
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
    });
  });

  describe("md5", () => {
    it("should generate MD5 hashes", () => {
      const hash = md5("hello");
      expect(hash).toHaveLength(32);
    });
  });

  describe("hmac / verifyHmac", () => {
    it("should create and verify HMAC", () => {
      const signature = hmac("message", "secret");
      expect(verifyHmac("message", signature, "secret")).toBe(true);
      expect(verifyHmac("message", "wrong", "secret")).toBe(false);
    });
  });

  describe("uuid / isUuid", () => {
    it("should generate valid UUIDs", () => {
      const id = uuid();
      expect(isUuid(id)).toBe(true);
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });
  });

  describe("shortHash", () => {
    it("should generate short hashes", () => {
      const hash = shortHash("content");
      expect(hash).toHaveLength(8);
    });
  });

  describe("randomHex / randomAlphanumeric", () => {
    it("should generate random hex strings", () => {
      const hex = randomHex(16);
      expect(hex).toHaveLength(32); // 16 bytes = 32 hex chars
    });

    it("should generate random alphanumeric strings", () => {
      const str = randomAlphanumeric(16);
      expect(str).toHaveLength(16);
      expect(str).toMatch(/^[a-zA-Z0-9]+$/);
    });
  });
});

// ============================================================================
// Time Utilities
// ============================================================================

describe("Time Utilities", () => {
  describe("toDateString / toTimeString", () => {
    it("should format date strings", () => {
      const date = new Date("2026-02-22T10:30:00Z");
      expect(toDateString(date)).toBe("2026-02-22");
      expect(toTimeString(date)).toBe("10:30:00");
    });
  });

  describe("parseDuration", () => {
    it("should parse duration strings", () => {
      expect(parseDuration("1h")).toBe(MS_PER_HOUR);
      expect(parseDuration("1d")).toBe(MS_PER_DAY);
      expect(parseDuration("30m")).toBe(30 * 60 * 1000);
      expect(parseDuration("500ms")).toBe(500);
    });

    it("should parse compound durations", () => {
      expect(parseDuration("1h 30m")).toBe(MS_PER_HOUR + 30 * 60 * 1000);
    });

    it("should handle invalid durations", () => {
      expect(parseDuration("invalid")).toBe(undefined);
    });
  });

  describe("formatDuration", () => {
    it("should format durations", () => {
      expect(formatDuration(MS_PER_HOUR, { short: true })).toBe("1h");
      expect(formatDuration(MS_PER_HOUR + 30 * 60 * 1000, { short: true })).toBe("1h 30m");
    });
  });

  describe("formatRelativeTime", () => {
    it("should format relative times", () => {
      const now = new Date();
      const hourAgo = new Date(now.getTime() - MS_PER_HOUR);
      expect(formatRelativeTime(hourAgo, now)).toContain("hour");
    });
  });
});
