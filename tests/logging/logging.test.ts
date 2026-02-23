/**
 * EndiorBot Logging Tests
 *
 * Unit tests for logging functionality.
 *
 * @module tests/logging
 * @version 1.0.0
 * @date 2026-02-22
 * @status ACTIVE - Sprint 33 Day 8-9
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  // Logger
  Logger,
  getLogger,
  configureLogger,
  createLogger,
  createConfiguredLogger,
  // Formatters
  formatJson,
  formatPretty,
  toStructuredLog,
  stripColors,
  // Redaction
  redactSensitive,
  redactSensitiveWithTracking,
  redactString,
  isSensitiveKey,
  isSensitiveValue,
  // Transports
  ConsoleTransport,
  FileTransport,
  parseSize,
  type LogEntry,
} from "../../src/logging/index.js";

// ============================================================================
// Test Helpers
// ============================================================================

function createTestEntry(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    level: "info",
    message: "Test message",
    timestamp: new Date("2026-02-22T10:00:00.000Z"),
    logger: "test",
    ...overrides,
  };
}

// ============================================================================
// Logger Tests
// ============================================================================

describe("Logger", () => {
  describe("basic logging", () => {
    it("should create logger with default options", () => {
      const logger = new Logger();
      expect(logger.getLevel()).toBe("info");
      expect(logger.getName()).toBe("app");
    });

    it("should create logger with custom options", () => {
      const logger = new Logger({ name: "test", level: "debug" });
      expect(logger.getLevel()).toBe("debug");
      expect(logger.getName()).toBe("test");
    });

    it("should check if debug is enabled", () => {
      const infoLogger = new Logger({ level: "info" });
      const debugLogger = new Logger({ level: "debug" });

      expect(infoLogger.isDebugEnabled()).toBe(false);
      expect(debugLogger.isDebugEnabled()).toBe(true);
    });
  });

  describe("child loggers", () => {
    it("should create child logger with context", () => {
      const parent = new Logger({ name: "parent", level: "debug" });
      const child = parent.child({ component: "auth" });

      expect(child.getName()).toBe("parent");
      expect(child.getLevel()).toBe("debug");
    });

    it("should create named child logger", () => {
      const parent = new Logger({ name: "parent" });
      const child = parent.named("child");

      expect(child.getName()).toBe("child");
    });
  });

  describe("factory functions", () => {
    it("should get default logger", () => {
      const logger = getLogger();
      expect(logger).toBeInstanceOf(Logger);
    });

    it("should configure default logger", () => {
      const logger = configureLogger({ level: "debug" });
      expect(logger.getLevel()).toBe("debug");
    });

    it("should create named logger", () => {
      const logger = createLogger("myapp");
      expect(logger.getName()).toBe("myapp");
    });

    it("should create configured logger", () => {
      const logger = createConfiguredLogger({
        name: "app",
        level: "warn",
        format: "json",
        redact: "all",
      });
      expect(logger.getName()).toBe("app");
      expect(logger.getLevel()).toBe("warn");
    });
  });

  describe("standard fields (ADR-001/ADR-002)", () => {
    describe("withCorrelation", () => {
      it("should create logger with correlation ID", () => {
        const logger = new Logger({ name: "test" });
        const withCorr = logger.withCorrelation("corr-123");

        expect(withCorr.getCorrelationId()).toBe("corr-123");
        expect(withCorr.getName()).toBe("test");
      });

      it("should preserve other settings", () => {
        const logger = new Logger({ name: "test", level: "debug", sessionId: "sess-1" });
        const withCorr = logger.withCorrelation("corr-123");

        expect(withCorr.getCorrelationId()).toBe("corr-123");
        expect(withCorr.getSessionId()).toBe("sess-1");
        expect(withCorr.getLevel()).toBe("debug");
      });
    });

    describe("withSession", () => {
      it("should create logger with session ID", () => {
        const logger = new Logger({ name: "test" });
        const withSess = logger.withSession("sess-456");

        expect(withSess.getSessionId()).toBe("sess-456");
        expect(withSess.getName()).toBe("test");
      });

      it("should preserve other settings", () => {
        const logger = new Logger({ name: "test", correlationId: "corr-1" });
        const withSess = logger.withSession("sess-456");

        expect(withSess.getSessionId()).toBe("sess-456");
        expect(withSess.getCorrelationId()).toBe("corr-1");
      });
    });

    describe("withProject", () => {
      it("should create logger with project ID", () => {
        const logger = new Logger({ name: "test" });
        const withProj = logger.withProject("proj-789");

        expect(withProj.getProjectId()).toBe("proj-789");
        expect(withProj.getName()).toBe("test");
      });

      it("should preserve other settings", () => {
        const logger = new Logger({
          name: "test",
          correlationId: "corr-1",
          sessionId: "sess-2",
        });
        const withProj = logger.withProject("proj-789");

        expect(withProj.getProjectId()).toBe("proj-789");
        expect(withProj.getCorrelationId()).toBe("corr-1");
        expect(withProj.getSessionId()).toBe("sess-2");
      });
    });

    describe("withStandardFields", () => {
      it("should set all standard fields at once", () => {
        const logger = new Logger({ name: "test" });
        const withFields = logger.withStandardFields({
          correlationId: "corr-all",
          sessionId: "sess-all",
          projectId: "proj-all",
        });

        expect(withFields.getCorrelationId()).toBe("corr-all");
        expect(withFields.getSessionId()).toBe("sess-all");
        expect(withFields.getProjectId()).toBe("proj-all");
      });

      it("should allow partial fields", () => {
        const logger = new Logger({ name: "test" });
        const withFields = logger.withStandardFields({
          correlationId: "corr-only",
        });

        expect(withFields.getCorrelationId()).toBe("corr-only");
        expect(withFields.getSessionId()).toBeUndefined();
        expect(withFields.getProjectId()).toBeUndefined();
      });

      it("should preserve existing fields when not overridden", () => {
        const logger = new Logger({
          name: "test",
          correlationId: "existing-corr",
          sessionId: "existing-sess",
        });
        const withFields = logger.withStandardFields({
          projectId: "new-proj",
        });

        expect(withFields.getCorrelationId()).toBe("existing-corr");
        expect(withFields.getSessionId()).toBe("existing-sess");
        expect(withFields.getProjectId()).toBe("new-proj");
      });
    });

    describe("getStandardFields", () => {
      it("should return all standard fields", () => {
        const logger = new Logger({
          name: "test",
          correlationId: "corr-1",
          sessionId: "sess-2",
          projectId: "proj-3",
        });

        const fields = logger.getStandardFields();

        expect(fields).toEqual({
          correlationId: "corr-1",
          sessionId: "sess-2",
          projectId: "proj-3",
        });
      });

      it("should return empty object for unset fields", () => {
        const logger = new Logger({ name: "test" });
        const fields = logger.getStandardFields();

        expect(fields).toEqual({});
        expect("correlationId" in fields).toBe(false);
        expect("sessionId" in fields).toBe(false);
        expect("projectId" in fields).toBe(false);
      });
    });

    describe("standard fields in child loggers", () => {
      it("should preserve standard fields in child()", () => {
        const logger = new Logger({
          name: "parent",
          correlationId: "corr-parent",
          sessionId: "sess-parent",
          projectId: "proj-parent",
        });
        const child = logger.child({ component: "auth" });

        expect(child.getCorrelationId()).toBe("corr-parent");
        expect(child.getSessionId()).toBe("sess-parent");
        expect(child.getProjectId()).toBe("proj-parent");
      });

      it("should preserve standard fields in named()", () => {
        const logger = new Logger({
          name: "parent",
          correlationId: "corr-parent",
        });
        const named = logger.named("child");

        expect(named.getName()).toBe("child");
        expect(named.getCorrelationId()).toBe("corr-parent");
      });
    });

    describe("standard fields in JSON output", () => {
      it("should include standard fields in structured log", () => {
        const entry = createTestEntry({
          correlationId: "corr-json",
          sessionId: "sess-json",
          projectId: "proj-json",
        });
        const structured = toStructuredLog(entry);

        expect(structured.correlationId).toBe("corr-json");
        expect(structured.sessionId).toBe("sess-json");
        expect(structured.projectId).toBe("proj-json");
      });

      it("should include standard fields in JSON format", () => {
        const entry = createTestEntry({
          correlationId: "corr-fmt",
          sessionId: "sess-fmt",
          projectId: "proj-fmt",
        });
        const json = formatJson(entry);
        const parsed = JSON.parse(json);

        expect(parsed.correlationId).toBe("corr-fmt");
        expect(parsed.sessionId).toBe("sess-fmt");
        expect(parsed.projectId).toBe("proj-fmt");
      });

      it("should omit undefined standard fields from output", () => {
        const entry = createTestEntry();
        const structured = toStructuredLog(entry);

        expect("correlationId" in structured).toBe(false);
        expect("sessionId" in structured).toBe(false);
        expect("projectId" in structured).toBe(false);
      });
    });
  });
});

// ============================================================================
// Formatter Tests
// ============================================================================

describe("Formatters", () => {
  describe("toStructuredLog", () => {
    it("should convert entry to structured format", () => {
      const entry = createTestEntry();
      const structured = toStructuredLog(entry);

      expect(structured.timestamp).toBe("2026-02-22T10:00:00.000Z");
      expect(structured.level).toBe("info");
      expect(structured.logger).toBe("test");
      expect(structured.message).toBe("Test message");
    });

    it("should include context if present", () => {
      const entry = createTestEntry({ context: { userId: "123" } });
      const structured = toStructuredLog(entry);

      expect(structured.context).toEqual({ userId: "123" });
    });

    it("should include error if present", () => {
      const error = new Error("Test error");
      const entry = createTestEntry({ error });
      const structured = toStructuredLog(entry);

      expect(structured.error?.name).toBe("Error");
      expect(structured.error?.message).toBe("Test error");
    });
  });

  describe("formatJson", () => {
    it("should format entry as JSON", () => {
      const entry = createTestEntry();
      const json = formatJson(entry);

      const parsed = JSON.parse(json);
      expect(parsed.level).toBe("info");
      expect(parsed.message).toBe("Test message");
    });

    it("should handle circular references gracefully", () => {
      const circular: Record<string, unknown> = { a: 1 };
      circular.self = circular;

      const entry = createTestEntry({ context: circular });
      const json = formatJson(entry);

      // Should not throw, should produce valid JSON
      expect(() => JSON.parse(json)).not.toThrow();
    });
  });

  describe("formatPretty", () => {
    it("should format entry with colors", () => {
      const entry = createTestEntry();
      const pretty = formatPretty(entry);

      expect(pretty).toContain("Test message");
    });

    it("should include context inline if small", () => {
      const entry = createTestEntry({ context: { key: "value" } });
      const pretty = formatPretty(entry);

      expect(pretty).toContain("key=");
    });
  });

  describe("stripColors", () => {
    it("should remove ANSI escape codes", () => {
      const colored = "\x1b[31mRed text\x1b[0m";
      expect(stripColors(colored)).toBe("Red text");
    });
  });
});

// ============================================================================
// Redaction Tests
// ============================================================================

describe("Redaction", () => {
  describe("isSensitiveKey", () => {
    it("should detect sensitive keys", () => {
      expect(isSensitiveKey("apiKey")).toBe(true);
      expect(isSensitiveKey("api_key")).toBe(true);
      expect(isSensitiveKey("password")).toBe(true);
      expect(isSensitiveKey("secret")).toBe(true);
      expect(isSensitiveKey("token")).toBe(true);
      expect(isSensitiveKey("ANTHROPIC_API_KEY")).toBe(true);
    });

    it("should not flag non-sensitive keys", () => {
      expect(isSensitiveKey("username")).toBe(false);
      expect(isSensitiveKey("email")).toBe(false);
      expect(isSensitiveKey("count")).toBe(false);
    });
  });

  describe("isSensitiveValue", () => {
    it("should detect API key patterns", () => {
      expect(isSensitiveValue("sk-1234567890abcdefghij")).toBe(true);
      expect(isSensitiveValue("pk-abcdefghij1234567890")).toBe(true);
    });

    it("should detect JWT tokens", () => {
      const jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
      expect(isSensitiveValue(jwt)).toBe(true);
    });

    it("should not flag normal values", () => {
      expect(isSensitiveValue("hello world")).toBe(false);
      expect(isSensitiveValue("12345")).toBe(false);
    });
  });

  describe("redactSensitive", () => {
    it("should redact sensitive keys", () => {
      const data = {
        username: "john",
        apiKey: "sk-secret123456789012345",
        password: "hunter2",
      };

      const redacted = redactSensitive(data, "tools");

      expect(redacted.username).toBe("john");
      expect(redacted.apiKey).toBe("[REDACTED]");
      expect(redacted.password).toBe("[REDACTED]");
    });

    it("should redact nested objects", () => {
      const data = {
        user: {
          name: "john",
          config: {
            token: "secret-token",
          },
        },
      };

      const redacted = redactSensitive(data, "tools");

      expect(redacted.user.name).toBe("john");
      expect(redacted.user.config.token).toBe("[REDACTED]");
    });

    it("should handle arrays", () => {
      const data = {
        keys: [
          { name: "key1", apiKey: "secret1" },
          { name: "key2", apiKey: "secret2" },
        ],
      };

      const redacted = redactSensitive(data, "tools");

      expect(redacted.keys[0]?.name).toBe("key1");
      expect(redacted.keys[0]?.apiKey).toBe("[REDACTED]");
    });

    it("should not redact when level is none", () => {
      const data = { apiKey: "secret" };
      const redacted = redactSensitive(data, "none");

      expect(redacted.apiKey).toBe("secret");
    });

    it("should handle circular references", () => {
      const data: Record<string, unknown> = { name: "test" };
      data.self = data;

      const redacted = redactSensitive(data, "tools");

      expect(redacted.name).toBe("test");
      expect(redacted.self).toBe("[Circular]");
    });
  });

  describe("redactSensitiveWithTracking", () => {
    it("should track redacted keys", () => {
      const data = {
        username: "john",
        apiKey: "secret",
        nested: { password: "hunter2" },
      };

      const result = redactSensitiveWithTracking(data, "tools");

      expect(result.redactedKeys).toContain("apiKey");
      expect(result.redactedKeys).toContain("nested.password");
      expect(result.redactedKeys).not.toContain("username");
    });
  });

  describe("redactString", () => {
    it("should redact API keys in text", () => {
      const text = "Using API key sk-1234567890abcdefghijklmnop for requests";
      const redacted = redactString(text);

      expect(redacted).toContain("sk-[REDACTED]");
      expect(redacted).not.toContain("1234567890");
    });

    it("should redact Bearer tokens", () => {
      const text = "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.test";
      const redacted = redactString(text);

      expect(redacted).toContain("Bearer [REDACTED]");
    });
  });
});

// ============================================================================
// Transport Tests
// ============================================================================

describe("Transports", () => {
  describe("ConsoleTransport", () => {
    it("should write to stdout for info", () => {
      const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
      const transport = new ConsoleTransport();

      transport.write("info", "Test message");

      expect(writeSpy).toHaveBeenCalledWith("Test message\n");
      writeSpy.mockRestore();
    });

    it("should write to stderr for errors", () => {
      const writeSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
      const transport = new ConsoleTransport({ useStderr: true });

      transport.write("error", "Error message");

      expect(writeSpy).toHaveBeenCalledWith("Error message\n");
      writeSpy.mockRestore();
    });
  });

  describe("FileTransport", () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "endiorbot-test-"));
    });

    afterEach(() => {
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it("should write to file", async () => {
      const logFile = path.join(tempDir, "test.log");
      const transport = new FileTransport({ path: logFile });

      transport.write("info", "Test log line");
      await transport.flush();
      await transport.close();

      const content = fs.readFileSync(logFile, "utf-8");
      expect(content).toContain("Test log line");
    });

    it("should create directory if not exists", async () => {
      const logFile = path.join(tempDir, "nested", "dir", "test.log");
      const transport = new FileTransport({ path: logFile });

      expect(fs.existsSync(path.dirname(logFile))).toBe(true);
      await transport.close();
    });
  });

  describe("parseSize", () => {
    it("should parse size strings", () => {
      expect(parseSize("10MB")).toBe(10 * 1024 * 1024);
      expect(parseSize("1GB")).toBe(1024 * 1024 * 1024);
      expect(parseSize("500KB")).toBe(500 * 1024);
      expect(parseSize("100B")).toBe(100);
    });

    it("should default to 10MB for invalid input", () => {
      expect(parseSize("invalid")).toBe(10 * 1024 * 1024);
    });
  });
});
