/**
 * Error Hierarchy Tests
 *
 * Tests for the unified error hierarchy and serialization.
 *
 * @module tests/errors/error-hierarchy.test
 * @version 1.0.0
 * @date 2026-02-25
 * @status ACTIVE - Sprint 49 Day 2
 */

import { describe, it, expect } from "vitest";
import {
  EndiorBotError,
  isEndiorBotError,
  isRetryable,
  wrapError,
  getErrorMessage,
} from "../../src/errors/base.js";
import {
  ProviderError,
  isProviderError,
  rateLimitError,
  authError,
  timeoutError,
  contextTooLongError,
} from "../../src/errors/provider.js";
import {
  GatewayError,
  isGatewayError,
  methodNotFoundError,
  invalidParamsError,
  authRequiredError,
  sessionNotFoundError,
} from "../../src/errors/gateway.js";
import {
  BrainError,
  isBrainError,
  brainNotInitializedError,
  layerNotFoundError,
  brainStorageError,
} from "../../src/errors/brain.js";
import {
  SecurityError,
  isSecurityError,
  injectionDetectedError,
  unauthorizedError,
  forbiddenError,
  tokenExpiredError,
} from "../../src/errors/security.js";
import {
  ConfigError,
  isConfigError,
  configNotFoundError,
  invalidJsonError,
  missingRequiredError,
  invalidValueError,
  envMissingError,
} from "../../src/errors/config.js";
import {
  BudgetError,
  isBudgetError,
  budgetExceededError,
  budgetThresholdWarning,
  approvalRequiredError,
  approvalDeniedError,
} from "../../src/errors/budget.js";
import { formatErrorForCLI, formatErrorForGateway } from "../../src/errors/index.js";

// ============================================================================
// Base Error Tests
// ============================================================================

describe("EndiorBotError", () => {
  it("should create error with all required fields", () => {
    const error = new EndiorBotError("Test error", {
      code: "TEST_ERROR",
      category: "CONFIG",
    });

    expect(error.message).toBe("Test error");
    expect(error.code).toBe("TEST_ERROR");
    expect(error.category).toBe("CONFIG");
    expect(error.retryable).toBe(false);
    expect(error.severity).toBe("error");
    expect(error.timestamp).toBeDefined();
    expect(error.metadata).toEqual({});
  });

  it("should serialize to JSON", () => {
    const error = new EndiorBotError("Test error", {
      code: "TEST_ERROR",
      category: "PROVIDER",
      retryable: true,
      severity: "warning",
      metadata: { key: "value" },
    });

    const json = error.toJSON();

    expect(json.name).toBe("EndiorBotError");
    expect(json.message).toBe("Test error");
    expect(json.code).toBe("TEST_ERROR");
    expect(json.category).toBe("PROVIDER");
    expect(json.retryable).toBe(true);
    expect(json.severity).toBe("warning");
    expect(json.timestamp).toBeDefined();
    expect(json.metadata).toEqual({ key: "value" });
  });

  it("should include cause in JSON if present", () => {
    const cause = new Error("Original error");
    const error = new EndiorBotError("Wrapped error", {
      code: "WRAPPED",
      category: "CONFIG",
      cause,
    });

    const json = error.toJSON();
    expect(json.cause).toEqual({
      name: "Error",
      message: "Original error",
      stack: expect.any(String),
    });
  });
});

describe("isEndiorBotError", () => {
  it("should return true for EndiorBotError instances", () => {
    const error = new EndiorBotError("Test", {
      code: "TEST",
      category: "CONFIG",
    });
    expect(isEndiorBotError(error)).toBe(true);
  });

  it("should return false for regular errors", () => {
    expect(isEndiorBotError(new Error("Test"))).toBe(false);
  });

  it("should return false for non-errors", () => {
    expect(isEndiorBotError("string")).toBe(false);
    expect(isEndiorBotError(null)).toBe(false);
    expect(isEndiorBotError(undefined)).toBe(false);
  });
});

describe("isRetryable", () => {
  it("should return true for retryable errors", () => {
    const error = new EndiorBotError("Retryable", {
      code: "TEST",
      category: "PROVIDER",
      retryable: true,
    });
    expect(isRetryable(error)).toBe(true);
  });

  it("should return false for non-retryable errors", () => {
    const error = new EndiorBotError("Not retryable", {
      code: "TEST",
      category: "PROVIDER",
      retryable: false,
    });
    expect(isRetryable(error)).toBe(false);
  });

  it("should return false for regular errors", () => {
    expect(isRetryable(new Error("Test"))).toBe(false);
  });
});

describe("wrapError", () => {
  it("should wrap Error instances", () => {
    const original = new Error("Original");
    const wrapped = wrapError(original, { code: "WRAPPED" });

    expect(wrapped).toBeInstanceOf(EndiorBotError);
    expect(wrapped.message).toBe("Original");
    expect(wrapped.code).toBe("WRAPPED");
    expect(wrapped.cause).toBe(original);
  });

  it("should wrap string errors", () => {
    const wrapped = wrapError("String error", { code: "STRING_ERROR" });

    expect(wrapped).toBeInstanceOf(EndiorBotError);
    expect(wrapped.message).toBe("String error");
  });

  it("should wrap unknown values", () => {
    const wrapped = wrapError(42, { code: "UNKNOWN" });

    expect(wrapped).toBeInstanceOf(EndiorBotError);
    expect(wrapped.message).toBe("42");
  });
});

describe("getErrorMessage", () => {
  it("should extract message from Error", () => {
    expect(getErrorMessage(new Error("Test"))).toBe("Test");
  });

  it("should return string directly", () => {
    expect(getErrorMessage("Direct string")).toBe("Direct string");
  });

  it("should convert unknown to string", () => {
    expect(getErrorMessage(123)).toBe("123");
    expect(getErrorMessage(null)).toBe("null");
  });
});

// ============================================================================
// Provider Error Tests
// ============================================================================

describe("ProviderError", () => {
  it("should create with factory function", () => {
    const error = rateLimitError("anthropic", { retryAfter: 60 });

    expect(error).toBeInstanceOf(ProviderError);
    expect(error.code).toBe("PROVIDER_RATE_LIMITED");
    expect(error.category).toBe("PROVIDER");
    expect(error.retryable).toBe(true);
    expect(isProviderError(error)).toBe(true);
  });

  it("should create auth error", () => {
    const error = authError("openai", "Invalid API key");

    expect(error.code).toBe("PROVIDER_AUTH_FAILED");
    expect(error.retryable).toBe(false);
    expect(error.message).toBe("Invalid API key");
  });

  it("should create timeout error", () => {
    const error = timeoutError("gemini", 30000, "gemini-pro");

    expect(error.code).toBe("PROVIDER_TIMEOUT");
    expect(error.retryable).toBe(true);
    expect(error.metadata.timeoutMs).toBe(30000);
  });

  it("should create context too long error", () => {
    const error = contextTooLongError("anthropic", 200000, 100000);

    expect(error.code).toBe("PROVIDER_CONTEXT_TOO_LONG");
    expect(error.retryable).toBe(false);
    expect(error.metadata.tokenCount).toBe(200000);
    expect(error.metadata.maxTokens).toBe(100000);
  });
});

// ============================================================================
// Gateway Error Tests
// ============================================================================

describe("GatewayError", () => {
  it("should create method not found error", () => {
    const error = methodNotFoundError("invalid.method");

    expect(error).toBeInstanceOf(GatewayError);
    expect(error.code).toBe("GATEWAY_METHOD_NOT_FOUND");
    expect(error.category).toBe("GATEWAY");
    expect(isGatewayError(error)).toBe(true);
  });

  it("should create invalid params error", () => {
    const error = invalidParamsError("session.create", "Missing sessionId");

    expect(error.code).toBe("GATEWAY_INVALID_PARAMS");
    expect(error.message).toContain("Missing sessionId");
  });

  it("should create auth required error", () => {
    const error = authRequiredError();

    expect(error.code).toBe("GATEWAY_AUTH_REQUIRED");
    expect(error.retryable).toBe(false);
  });

  it("should create session not found error", () => {
    const error = sessionNotFoundError("sess_123");

    expect(error.code).toBe("GATEWAY_SESSION_NOT_FOUND");
    expect(error.message).toContain("sess_123");
  });
});

// ============================================================================
// Brain Error Tests
// ============================================================================

describe("BrainError", () => {
  it("should create brain not initialized error", () => {
    const error = brainNotInitializedError();

    expect(error).toBeInstanceOf(BrainError);
    expect(error.code).toBe("BRAIN_NOT_INITIALIZED");
    expect(error.category).toBe("BRAIN");
    expect(isBrainError(error)).toBe(true);
  });

  it("should create layer not found error", () => {
    const error = layerNotFoundError(5);

    expect(error.code).toBe("BRAIN_LAYER_NOT_FOUND");
    expect(error.message).toContain("5");
  });

  it("should create storage error", () => {
    const cause = new Error("Disk full");
    const error = brainStorageError("write", cause);

    expect(error.code).toBe("BRAIN_STORAGE_ERROR");
    expect(error.retryable).toBe(true);
    expect(error.cause).toBe(cause);
  });
});

// ============================================================================
// Security Error Tests
// ============================================================================

describe("SecurityError", () => {
  it("should create injection detected error", () => {
    const error = injectionDetectedError("sql", "telegram", "user_123");

    expect(error).toBeInstanceOf(SecurityError);
    expect(error.code).toBe("SECURITY_SQL_INJECTION_DETECTED");
    expect(error.category).toBe("SECURITY");
    expect(error.retryable).toBe(false);
    expect(isSecurityError(error)).toBe(true);
  });

  it("should exclude detected pattern from JSON", () => {
    const error = new SecurityError("Injection detected", {
      code: "SECURITY_INJECTION_DETECTED",
      detectedPattern: "'; DROP TABLE users;--",
    });

    const json = error.toJSON();
    expect(json.detectedPattern).toBeUndefined();
  });

  it("should create unauthorized error", () => {
    const error = unauthorizedError("Access denied");

    expect(error.code).toBe("SECURITY_UNAUTHORIZED");
    expect(error.message).toBe("Access denied");
  });

  it("should create forbidden error", () => {
    const error = forbiddenError();

    expect(error.code).toBe("SECURITY_FORBIDDEN");
  });

  it("should create token expired error", () => {
    const error = tokenExpiredError();

    expect(error.code).toBe("SECURITY_TOKEN_EXPIRED");
  });
});

// ============================================================================
// Config Error Tests
// ============================================================================

describe("ConfigError", () => {
  it("should create config not found error", () => {
    const error = configNotFoundError("/path/to/config.json");

    expect(error).toBeInstanceOf(ConfigError);
    expect(error.code).toBe("CONFIG_NOT_FOUND");
    expect(error.category).toBe("CONFIG");
    expect(isConfigError(error)).toBe(true);
  });

  it("should provide suggestion", () => {
    const error = missingRequiredError("apiKey");

    expect(error.getSuggestion()).toContain("apiKey");
  });

  it("should create invalid JSON error with cause", () => {
    const cause = new SyntaxError("Unexpected token");
    const error = invalidJsonError("/config.json", cause);

    expect(error.code).toBe("CONFIG_INVALID_JSON");
    expect(error.cause).toBe(cause);
  });

  it("should create invalid value error", () => {
    const error = invalidValueError("timeout", "number > 0", "-5");

    expect(error.code).toBe("CONFIG_INVALID_VALUE");
    expect(error.message).toContain("timeout");
  });

  it("should create env missing error", () => {
    const error = envMissingError("API_KEY");

    expect(error.code).toBe("CONFIG_ENV_MISSING");
    expect(error.getSuggestion()).toContain("API_KEY");
  });
});

// ============================================================================
// Budget Error Tests
// ============================================================================

describe("BudgetError", () => {
  it("should create budget exceeded error", () => {
    const error = budgetExceededError(150000, 100000, "sess_123");

    expect(error).toBeInstanceOf(BudgetError);
    expect(error.code).toBe("BUDGET_EXCEEDED");
    expect(error.category).toBe("BUDGET");
    expect(error.currentTokens).toBe(150000);
    expect(error.limit).toBe(100000);
    expect(error.percentUsed).toBe(150);
    expect(isBudgetError(error)).toBe(true);
  });

  it("should create threshold warning", () => {
    const error = budgetThresholdWarning(80000, 100000, 75);

    expect(error.code).toBe("BUDGET_THRESHOLD_WARNING");
    expect(error.severity).toBe("warning");
    expect(error.percentUsed).toBe(80);
  });

  it("should create approval required error", () => {
    const error = approvalRequiredError(95000, 100000);

    expect(error.code).toBe("BUDGET_APPROVAL_REQUIRED");
    expect(error.retryable).toBe(true);
    expect(error.requiresApproval()).toBe(true);
  });

  it("should create approval denied error", () => {
    const error = approvalDeniedError("sess_456");

    expect(error.code).toBe("BUDGET_APPROVAL_DENIED");
    expect(error.severity).toBe("critical");
  });

  it("should calculate remaining tokens", () => {
    const error = budgetExceededError(80000, 100000);

    expect(error.getRemainingTokens()).toBe(20000);
  });
});

// ============================================================================
// Formatting Tests
// ============================================================================

describe("formatErrorForCLI", () => {
  it("should format EndiorBotError", () => {
    const error = new EndiorBotError("Test error", {
      code: "TEST_ERROR",
      category: "CONFIG",
      metadata: { file: "config.json" },
    });

    const output = formatErrorForCLI(error);

    expect(output).toContain("Error: Test error");
    expect(output).toContain("Code: TEST_ERROR");
    expect(output).toContain("Category: CONFIG");
    expect(output).toContain("config.json");
  });

  it("should format regular Error", () => {
    const error = new Error("Simple error");
    const output = formatErrorForCLI(error);

    expect(output).toBe("Error: Simple error");
  });

  it("should format string error", () => {
    const output = formatErrorForCLI("String error");

    expect(output).toBe("Error: String error");
  });
});

describe("formatErrorForGateway", () => {
  it("should format EndiorBotError for JSON-RPC", () => {
    const error = new EndiorBotError("Gateway error", {
      code: "TEST_ERROR",
      category: "GATEWAY",
      retryable: true,
      metadata: { sessionId: "sess_123" },
    });

    const result = formatErrorForGateway(error);

    expect(result.code).toBe(-32000); // GATEWAY code
    expect(result.message).toBe("Gateway error");
    expect(result.data?.errorCode).toBe("TEST_ERROR");
    expect(result.data?.retryable).toBe(true);
  });

  it("should format regular Error", () => {
    const error = new Error("Internal error");
    const result = formatErrorForGateway(error);

    expect(result.code).toBe(-32603); // Internal error
    expect(result.message).toBe("Internal error");
  });

  it("should use correct JSON-RPC codes for categories", () => {
    const categories = [
      { category: "GATEWAY", expectedCode: -32000 },
      { category: "SECURITY", expectedCode: -32001 },
      { category: "PROVIDER", expectedCode: -32002 },
      { category: "BUDGET", expectedCode: -32003 },
      { category: "CONFIG", expectedCode: -32004 },
      { category: "BRAIN", expectedCode: -32005 },
    ] as const;

    for (const { category, expectedCode } of categories) {
      const error = new EndiorBotError("Test", {
        code: "TEST",
        category,
      });
      const result = formatErrorForGateway(error);
      expect(result.code).toBe(expectedCode);
    }
  });
});
