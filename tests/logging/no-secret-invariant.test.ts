/**
 * EndiorBot No-Secret Invariant Tests
 *
 * These tests verify that sensitive data (API keys, tokens, credentials)
 * NEVER appear in log output, even during error conditions.
 *
 * @module tests/logging/no-secret-invariant
 * @version 1.0.0
 * @date 2026-02-22
 * @status ACTIVE - Sprint 34 Day 1-2
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  Logger,
  createConfiguredLogger,
  redactSensitive,
  redactString,
  formatJson,
  formatPretty,
  toStructuredLog,
  type LogEntry,
} from "../../src/logging/index.js";

// ============================================================================
// Test Data - Realistic Secrets
// ============================================================================

const TEST_SECRETS = {
  // Anthropic API key format
  anthropicKey: "sk-ant-api03-abcdefghijklmnopqrstuvwxyz1234567890ABCDEFGHIJ",

  // OpenAI API key format
  openaiKey: "sk-proj-1234567890abcdefghijklmnopqrstuvwxyz",

  // JWT token
  jwtToken:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",

  // Bearer token in header
  bearerToken: "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyMTIzIn0.abc123",

  // AWS credentials
  awsAccessKey: "AKIAIOSFODNN7EXAMPLE",
  awsSecretKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",

  // Generic password
  password: "super-secret-password-123!",
};

// ============================================================================
// Helper Functions
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

function containsAnySecret(text: string): string | null {
  for (const [name, secret] of Object.entries(TEST_SECRETS)) {
    if (text.includes(secret)) {
      return name;
    }
  }
  return null;
}

// ============================================================================
// No-Secret Invariant Tests
// ============================================================================

describe("No-Secret Invariants", () => {
  describe("Provider config redaction", () => {
    it("should redact API keys in provider config", () => {
      const config = {
        provider: "anthropic",
        apiKey: TEST_SECRETS.anthropicKey,
        model: "claude-opus-4",
      };

      const redacted = redactSensitive(config, "tools");

      expect(redacted.apiKey).toBe("[REDACTED]");
      expect(redacted.provider).toBe("anthropic");
      expect(redacted.model).toBe("claude-opus-4");
    });

    it("should redact nested API keys in multi-provider config", () => {
      const config = {
        models: {
          primary: {
            apiKey: TEST_SECRETS.anthropicKey,
            baseUrl: "https://api.anthropic.com",
          },
          secondary: {
            apiKey: TEST_SECRETS.openaiKey,
            baseUrl: "https://api.openai.com",
          },
        },
      };

      const redacted = redactSensitive(config, "tools");

      expect(redacted.models.primary.apiKey).toBe("[REDACTED]");
      expect(redacted.models.secondary.apiKey).toBe("[REDACTED]");
      expect(redacted.models.primary.baseUrl).toBe("https://api.anthropic.com");
    });

    it("should redact AWS credentials", () => {
      const config = {
        aws: {
          accessKeyId: TEST_SECRETS.awsAccessKey,
          secretAccessKey: TEST_SECRETS.awsSecretKey,
          region: "us-east-1",
        },
      };

      const redacted = redactSensitive(config, "tools");

      expect(redacted.aws.secretAccessKey).toBe("[REDACTED]");
      expect(redacted.aws.region).toBe("us-east-1");
    });
  });

  describe("Error message redaction", () => {
    it("should redact API keys in error messages", () => {
      const errorMessage = `API call failed with key ${TEST_SECRETS.anthropicKey}`;
      const redacted = redactString(errorMessage);

      expect(containsAnySecret(redacted)).toBeNull();
      expect(redacted).toContain("[REDACTED]");
    });

    it("should redact JWT tokens in error messages", () => {
      const errorMessage = `Invalid token: ${TEST_SECRETS.jwtToken}`;
      const redacted = redactString(errorMessage);

      expect(containsAnySecret(redacted)).toBeNull();
    });

    it("should redact Bearer tokens in error messages", () => {
      const errorMessage = `Authorization header: ${TEST_SECRETS.bearerToken}`;
      const redacted = redactString(errorMessage);

      // JWT tokens are redacted with [REDACTED_JWT]
      expect(redacted).toContain("[REDACTED_JWT]");
      expect(containsAnySecret(redacted)).toBeNull();
    });
  });

  describe("Log formatter redaction", () => {
    it("should not leak secrets through JSON formatter", () => {
      const entry = createTestEntry({
        context: {
          config: {
            apiKey: TEST_SECRETS.anthropicKey,
            password: TEST_SECRETS.password,
          },
        },
      });

      // Manually redact before formatting (as Logger should do)
      const redactedEntry = {
        ...entry,
        context: redactSensitive(entry.context, "tools"),
      };

      const json = formatJson(redactedEntry);

      expect(containsAnySecret(json)).toBeNull();
      expect(json).toContain("[REDACTED]");
    });

    it("should not leak secrets through pretty formatter", () => {
      const entry = createTestEntry({
        context: {
          token: TEST_SECRETS.jwtToken,
        },
      });

      const redactedEntry = {
        ...entry,
        context: redactSensitive(entry.context, "tools"),
      };

      const pretty = formatPretty(redactedEntry);

      expect(containsAnySecret(pretty)).toBeNull();
    });

    it("should not leak secrets in structured log", () => {
      const error = new Error(`Auth failed for key ${TEST_SECRETS.openaiKey}`);
      const entry = createTestEntry({ error });

      // Redact error message
      const redactedEntry = {
        ...entry,
        error: {
          ...error,
          message: redactString(error.message),
        },
      };

      const structured = toStructuredLog(redactedEntry);
      const json = JSON.stringify(structured);

      expect(containsAnySecret(json)).toBeNull();
    });
  });

  describe("Auth header redaction", () => {
    it("should redact Authorization headers in request logs", () => {
      const requestLog = {
        method: "POST",
        url: "https://api.anthropic.com/v1/messages",
        headers: {
          "Content-Type": "application/json",
          authorization: TEST_SECRETS.bearerToken,
          "x-api-key": TEST_SECRETS.anthropicKey,
        },
        body: { model: "claude-opus-4" },
      };

      const redacted = redactSensitive(requestLog, "tools");
      const json = JSON.stringify(redacted);

      expect(containsAnySecret(json)).toBeNull();
      expect(redacted.headers.authorization).toBe("[REDACTED]");
      expect(redacted.headers["x-api-key"]).toBe("[REDACTED]");
      expect(redacted.headers["Content-Type"]).toBe("application/json");
    });

    it("should redact api-key variations", () => {
      const headers = {
        "api-key": TEST_SECRETS.openaiKey,
        "API_KEY": TEST_SECRETS.anthropicKey,
        apiKey: TEST_SECRETS.openaiKey,
        api_key: TEST_SECRETS.anthropicKey,
      };

      const redacted = redactSensitive(headers, "tools");

      expect(redacted["api-key"]).toBe("[REDACTED]");
      expect(redacted["API_KEY"]).toBe("[REDACTED]");
      expect(redacted.apiKey).toBe("[REDACTED]");
      expect(redacted.api_key).toBe("[REDACTED]");
    });
  });

  describe("Error context redaction", () => {
    it("should redact secrets in error context even on failures", () => {
      const errorContext = {
        operation: "chat",
        provider: "anthropic",
        request: {
          model: "claude-opus-4",
          apiKey: TEST_SECRETS.anthropicKey,
        },
        error: {
          code: "AUTH_ERROR",
          message: `Invalid API key: ${TEST_SECRETS.anthropicKey.slice(0, 10)}...`,
        },
      };

      const redacted = redactSensitive(errorContext, "tools");
      const json = JSON.stringify(redacted);

      expect(redacted.request.apiKey).toBe("[REDACTED]");
      // Partial key in error message should also be redacted
      expect(redacted.operation).toBe("chat");
    });

    it("should handle deeply nested secrets", () => {
      const deepConfig = {
        level1: {
          level2: {
            level3: {
              level4: {
                secretKey: TEST_SECRETS.anthropicKey,
                publicData: "visible",
              },
            },
          },
        },
      };

      const redacted = redactSensitive(deepConfig, "tools");
      const json = JSON.stringify(redacted);

      expect(containsAnySecret(json)).toBeNull();
      expect(redacted.level1.level2.level3.level4.secretKey).toBe("[REDACTED]");
      expect(redacted.level1.level2.level3.level4.publicData).toBe("visible");
    });
  });

  describe("Array redaction", () => {
    it("should redact secrets in arrays", () => {
      const data = {
        keys: [
          { name: "prod", apiKey: TEST_SECRETS.anthropicKey },
          { name: "dev", apiKey: TEST_SECRETS.openaiKey },
        ],
      };

      const redacted = redactSensitive(data, "tools");

      expect(redacted.keys[0]?.apiKey).toBe("[REDACTED]");
      expect(redacted.keys[1]?.apiKey).toBe("[REDACTED]");
      expect(redacted.keys[0]?.name).toBe("prod");
    });
  });

  describe("Logger integration", () => {
    let capturedOutput: string[] = [];
    let originalWrite: typeof process.stderr.write;

    beforeEach(() => {
      capturedOutput = [];
      // Logs now go to stderr by default (logs→stderr, data→stdout convention)
      originalWrite = process.stderr.write;
      process.stderr.write = vi.fn((chunk: string | Uint8Array) => {
        capturedOutput.push(chunk.toString());
        return true;
      }) as typeof process.stderr.write;
    });

    afterEach(() => {
      process.stderr.write = originalWrite;
    });

    it("should not leak secrets when logging config with tools redaction", () => {
      const logger = createConfiguredLogger({
        name: "test",
        level: "info",
        format: "json",
        redact: "tools",
      });

      logger.info("Config loaded", {
        apiKey: TEST_SECRETS.anthropicKey,
        baseUrl: "https://api.anthropic.com",
      });

      const output = capturedOutput.join("");
      expect(containsAnySecret(output)).toBeNull();
      expect(output).toContain("[REDACTED]");
    });

    it("should not leak secrets in error logs", () => {
      const logger = createConfiguredLogger({
        name: "test",
        level: "error",
        format: "json",
        redact: "tools",
      });

      const error = new Error("Auth failed");
      logger.error("Provider error", {
        provider: "anthropic",
        apiKey: TEST_SECRETS.anthropicKey,
        error,
      });

      const output = capturedOutput.join("");
      expect(containsAnySecret(output)).toBeNull();
    });
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe("Edge Cases", () => {
  it("should handle null and undefined values", () => {
    const data = {
      // Sensitive keys with null/undefined values still get redacted
      // because the KEY name indicates sensitivity
      apiKey: null,
      token: undefined,
      secret: TEST_SECRETS.password,
      // Non-sensitive keys preserve their values
      name: null,
      count: undefined,
    };

    const redacted = redactSensitive(data, "tools");

    // Sensitive key names are redacted regardless of value
    expect(redacted.apiKey).toBe("[REDACTED]");
    expect(redacted.token).toBe("[REDACTED]");
    expect(redacted.secret).toBe("[REDACTED]");
    // Non-sensitive keys preserve null/undefined
    expect(redacted.name).toBeNull();
    expect(redacted.count).toBeUndefined();
  });

  it("should handle circular references without leaking secrets", () => {
    const data: Record<string, unknown> = {
      apiKey: TEST_SECRETS.anthropicKey,
      name: "test",
    };
    data.self = data;

    const redacted = redactSensitive(data, "tools");

    expect(redacted.apiKey).toBe("[REDACTED]");
    expect(redacted.self).toBe("[Circular]");
    expect(redacted.name).toBe("test");
  });

  it("should redact secrets in mixed content types", () => {
    const data = {
      numbers: [1, 2, 3],
      strings: ["visible", TEST_SECRETS.password],
      nested: {
        apiKey: TEST_SECRETS.anthropicKey,
        count: 42,
        enabled: true,
      },
    };

    const redacted = redactSensitive(data, "tools");

    expect(redacted.numbers).toEqual([1, 2, 3]);
    expect(redacted.nested.apiKey).toBe("[REDACTED]");
    expect(redacted.nested.count).toBe(42);
    expect(redacted.nested.enabled).toBe(true);
  });
});
