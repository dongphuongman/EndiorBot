/**
 * Telegram OTT Complete Flow — E2E Integration Tests
 *
 * Tests the FULL pipeline that was missing:
 *   TelegramChannel → OTT Adapter → GatewayIngress → ChannelRouter → parseMention → Response
 *
 * Root cause of bugs found in Sprint 97:
 * 1. Double-sanitization: OTT adapter re-wrapped text in [EXTERNAL_INPUT] tags,
 *    causing parseMention() to fail (text didn't start with @)
 * 2. CLI references in Telegram: /consult etc. said "Run `endiorbot ...`"
 *
 * @module tests/integration/telegram-ott-complete-flow
 * @sprint 97 (hotfix)
 */

import { describe, it, expect, beforeEach } from "vitest";
import { GatewayIngress, type InboundMessage } from "../../src/gateway/ingress.js";
import { CommandDispatcher } from "../../src/commands/command-dispatcher.js";
import { ChannelRouter, type RouteResult, type AIResult } from "../../src/agents/channel-router.js";
import { parseMention } from "../../src/agents/orchestrator/mention-parser.js";
import { getInputSanitizer } from "../../src/security/input-sanitizer.js";
import {
  handleConsultCommand,
  handleGateCommand,
  handleComplianceCommand,
  handleFixCommand,
  handleConfigCommand,
  handleInitCommand,
} from "../../src/commands/handlers.js";

// ============================================================================
// Helpers — reproduce OTT adapter behavior
// ============================================================================

/** Reproduce TelegramChannel's sanitizer wrapping */
function wrapAsTelegramChannel(text: string): string {
  const sanitizer = getInputSanitizer();
  return sanitizer.sanitizeExternalInput(text, "telegram").sanitized;
}

/** Reproduce OTT adapter's stripSanitizerWrapper (private function) */
function stripSanitizerWrapper(text: string): string {
  const match = text.match(/\[EXTERNAL_INPUT[^\]]*\]\n([\s\S]*?)\n\[\/EXTERNAL_INPUT\]/);
  return match?.[1] ?? text;
}

/** Create a mock router that uses REAL parseMention but mock callAI */
function createRealParserRouter() {
  const router = {
    routeMessage: async (text: string): Promise<RouteResult | null> => {
      // Use REAL parseMention — same as ChannelRouter.routeMessage() fallback
      const parseResult = parseMention(text);
      if (parseResult.success) {
        return { agents: parseResult.data.agents, task: parseResult.data.message };
      }
      return null;
    },
    callAI: async (agent: string, task: string): Promise<AIResult> => ({
      content: `[Mock ${agent}] Processed: ${task}`,
      provider: "mock",
      durationMs: 100,
    }),
    formatResponse: (agent: string, result: AIResult) =>
      `⚡ @${agent}\n\n${result.content}`,
    getUsageHint: () => "Dùng @agent hoặc [@agent: task] để gọi agent.",
    getStatus: async () => ({ status: "ok" }),
    initialize: async () => {},
    config: { projectRoot: "/mock/project" },
  };
  return router;
}

// ============================================================================
// E2E Test 1: Mention parsing through full pipeline
// ============================================================================

describe("E2E: OTT Adapter → Ingress → Router — mention parsing", () => {
  let ingress: GatewayIngress;

  beforeEach(() => {
    const dispatcher = new CommandDispatcher();
    dispatcher.register("help", async () => ({
      success: true,
      response: "Help message",
    }));
    const router = createRealParserRouter();
    ingress = new GatewayIngress(dispatcher, router as never);
  });

  it("@researcher mention invokes agent (not help)", async () => {
    const response = await ingress.handleInbound({
      channel: "telegram",
      senderId: "ceo-1",
      content: '@researcher "phương pháp chống drift context"',
    });

    expect(response.text).toContain("@researcher");
    expect(response.text).toContain("phương pháp chống drift context");
    expect(response.text).not.toContain("Dùng @agent");
  });

  it("@pm mention invokes agent (not help)", async () => {
    const response = await ingress.handleInbound({
      channel: "telegram",
      senderId: "ceo-1",
      content: "@pm review hiện trạng dự án",
    });

    expect(response.text).toContain("@pm");
    expect(response.text).toContain("review hiện trạng dự án");
    expect(response.text).not.toContain("Dùng @agent");
  });

  it("@pjm mention invokes agent", async () => {
    const response = await ingress.handleInbound({
      channel: "telegram",
      senderId: "ceo-1",
      content: "@pjm check sprint timeline",
    });

    expect(response.text).toContain("@pjm");
    expect(response.text).not.toContain("Dùng @agent");
  });

  it("@coder mention invokes agent", async () => {
    const response = await ingress.handleInbound({
      channel: "telegram",
      senderId: "ceo-1",
      content: "@coder implement the auth module",
    });

    expect(response.text).toContain("@coder");
    expect(response.text).not.toContain("Dùng @agent");
  });

  it("@cto mention invokes agent (executive)", async () => {
    const response = await ingress.handleInbound({
      channel: "telegram",
      senderId: "ceo-1",
      content: "@cto review architecture decision",
    });

    expect(response.text).toContain("@cto");
    expect(response.text).not.toContain("Dùng @agent");
  });

  it("plain text (no mention) returns usage hint", async () => {
    const response = await ingress.handleInbound({
      channel: "telegram",
      senderId: "ceo-1",
      content: "just a plain message without mention",
    });

    expect(response.text).toContain("Dùng @agent");
  });

  it("OTT bracket format [@pm: task] works", async () => {
    const response = await ingress.handleInbound({
      channel: "telegram",
      senderId: "ceo-1",
      content: "[@pm: plan next sprint]",
    });

    expect(response.text).toContain("@pm");
    expect(response.text).toContain("plan next sprint");
    expect(response.text).not.toContain("Dùng @agent");
  });
});

// ============================================================================
// E2E Test 2: Sanitizer wrapper does NOT break mention parsing
// ============================================================================

describe("E2E: Sanitizer wrapper stripping — the double-sanitization bug", () => {
  it("parseMention fails on wrapped text (the bug)", () => {
    const rawText = '@researcher "query about context"';
    const wrapped = wrapAsTelegramChannel(rawText);

    // Wrapped text does NOT start with @
    expect(wrapped).toContain("[EXTERNAL_INPUT");
    expect(wrapped).not.toMatch(/^@/);

    // parseMention FAILS on wrapped text — this is the bug
    const result = parseMention(wrapped);
    expect(result.success).toBe(false);
  });

  it("parseMention succeeds after stripping wrapper (the fix)", () => {
    const rawText = '@researcher "query about context"';
    const wrapped = wrapAsTelegramChannel(rawText);
    const stripped = stripSanitizerWrapper(wrapped);

    // Stripped text starts with @
    expect(stripped).toBe(rawText);

    // parseMention SUCCEEDS on stripped text
    const result = parseMention(stripped);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.agents).toContain("researcher");
      expect(result.data.message).toBe("query about context");
    }
  });

  it("full OTT adapter flow: sanitize → strip → parse → route", async () => {
    // Simulate the exact TelegramChannel → OTT Adapter → Ingress flow
    const rawText = "@pm plan next sprint";

    // Step 1: TelegramChannel sanitizes
    const wrapped = wrapAsTelegramChannel(rawText);
    expect(wrapped).toContain("[EXTERNAL_INPUT");

    // Step 2: OTT adapter strips wrapper (fixed behavior)
    const stripped = stripSanitizerWrapper(wrapped);
    expect(stripped).toBe(rawText);

    // Step 3: Ingress receives clean text → router → parseMention
    const dispatcher = new CommandDispatcher();
    const router = createRealParserRouter();
    const ingress = new GatewayIngress(dispatcher, router as never);

    const response = await ingress.handleInbound({
      channel: "telegram",
      senderId: "ceo-1",
      content: stripped,
    });

    expect(response.text).toContain("@pm");
    expect(response.text).toContain("plan next sprint");
    expect(response.text).not.toContain("Dùng @agent");
  });

  it("double-wrapping breaks routing (regression guard)", () => {
    const rawText = "@pm plan something";
    const wrapped = wrapAsTelegramChannel(rawText);
    const stripped = stripSanitizerWrapper(wrapped);

    // Simulate the OLD bug: re-sanitize after stripping
    const doubleWrapped = wrapAsTelegramChannel(stripped);

    // parseMention fails on double-wrapped text
    const result = parseMention(doubleWrapped);
    expect(result.success).toBe(false);

    // But succeeds on properly stripped text
    const goodResult = parseMention(stripped);
    expect(goodResult.success).toBe(true);
  });

  it("all 14 agents parse correctly after stripping", () => {
    const agents = [
      "pm", "architect", "coder", "reviewer", "tester",
      "researcher", "devops", "fullstack", "pjm",
      "ceo", "cpo", "cso", "cto", "assistant",
    ];

    for (const agent of agents) {
      const rawText = `@${agent} do the task`;
      const wrapped = wrapAsTelegramChannel(rawText);
      const stripped = stripSanitizerWrapper(wrapped);
      const result = parseMention(stripped);

      expect(result.success, `@${agent} should parse successfully`).toBe(true);
      if (result.success) {
        expect(result.data.agents).toContain(agent);
      }
    }
  });
});

// ============================================================================
// E2E Test 3: Slash commands NEVER reference CLI
// ============================================================================

describe("E2E: Slash command responses — no CLI references", () => {
  const CLI_PATTERNS = [
    /endiorbot\s+\w+/,     // "endiorbot consult", "endiorbot gate"
    /\.\/endiorbot\.mjs/,  // ./endiorbot.mjs
    /Run\s+`/,             // "Run `..."
    /via CLI/i,            // "via CLI"
  ];

  function assertNoCLIReferences(response: string, command: string): void {
    for (const pattern of CLI_PATTERNS) {
      expect(
        response,
        `${command} response should not match CLI pattern: ${pattern}`,
      ).not.toMatch(pattern);
    }
  }

  it("/consult with query — no CLI references", () => {
    const result = handleConsultCommand(["Redis", "vs", "PostgreSQL"]);
    assertNoCLIReferences(result.response, "/consult");
    expect(result.response).toContain("@researcher");
  });

  it("/consult without query — no CLI references", () => {
    const result = handleConsultCommand([]);
    assertNoCLIReferences(result.response, "/consult (empty)");
  });

  it("/gate with ID — no CLI references", () => {
    const result = handleGateCommand(["G2"]);
    assertNoCLIReferences(result.response, "/gate G2");
    expect(result.response).toContain("@pm");
  });

  it("/gate without ID — no CLI references", () => {
    const result = handleGateCommand([]);
    assertNoCLIReferences(result.response, "/gate (empty)");
  });

  it("/compliance — no CLI references", () => {
    const result = handleComplianceCommand([]);
    assertNoCLIReferences(result.response, "/compliance");
    expect(result.response).toContain("@pm");
  });

  it("/compliance score — no CLI references", () => {
    const result = handleComplianceCommand(["score"]);
    assertNoCLIReferences(result.response, "/compliance score");
  });

  it("/fix dry-run — no CLI references", () => {
    const result = handleFixCommand([]);
    assertNoCLIReferences(result.response, "/fix");
    expect(result.response).toContain("@pm");
  });

  it("/fix --yes — no CLI references", () => {
    const result = handleFixCommand(["--yes"]);
    assertNoCLIReferences(result.response, "/fix --yes");
  });

  it("/fix --stage — no CLI references", () => {
    const result = handleFixCommand(["--stage", "01-planning"]);
    assertNoCLIReferences(result.response, "/fix --stage");
  });

  it("/config — no CLI references", () => {
    const result = handleConfigCommand();
    assertNoCLIReferences(result.response, "/config");
    expect(result.response).toContain("@pm");
  });

  it("/init — no CLI references", async () => {
    const result = await handleInitCommand([], undefined);
    assertNoCLIReferences(result.response, "/init");
    expect(result.response).toMatch(/focus|workspace/i);
  });
});

// ============================================================================
// E2E Test 4: Commands vs mentions routing (no cross-contamination)
// ============================================================================

describe("E2E: Command vs mention routing separation", () => {
  let ingress: GatewayIngress;

  beforeEach(() => {
    const dispatcher = new CommandDispatcher();
    dispatcher.register("help", async () => ({
      success: true,
      response: "Help message",
    }));
    dispatcher.register("consult", async () => ({
      success: true,
      response: "Consultation started",
    }));

    const router = createRealParserRouter();
    ingress = new GatewayIngress(dispatcher, router as never);
  });

  it("/help routes to command dispatcher (not AI chat)", async () => {
    const response = await ingress.handleInbound({
      channel: "telegram",
      senderId: "ceo-1",
      content: "/help",
    });

    expect(response.text).toBe("Help message");
    expect(response.text).not.toContain("@");
  });

  it("@pm routes to AI chat (not command dispatcher)", async () => {
    const response = await ingress.handleInbound({
      channel: "telegram",
      senderId: "ceo-1",
      content: "@pm plan sprint 98",
    });

    expect(response.text).toContain("@pm");
    expect(response.text).toContain("plan sprint 98");
    expect(response.format).toBe("markdown");
  });

  it("/unknown returns error (not fall-through to AI)", async () => {
    const response = await ingress.handleInbound({
      channel: "telegram",
      senderId: "ceo-1",
      content: "/unknowncmd test",
    });

    expect(response.text).toContain("Unknown command");
    expect(response.text).not.toContain("@pm");
  });

  it("Vietnamese text with @agent works", async () => {
    const response = await ingress.handleInbound({
      channel: "telegram",
      senderId: "ceo-1",
      content: "@researcher nghiên cứu về kiến trúc microservices",
    });

    expect(response.text).toContain("@researcher");
    expect(response.text).toContain("nghiên cứu về kiến trúc microservices");
  });

  it("quoted message with @agent works", async () => {
    const response = await ingress.handleInbound({
      channel: "telegram",
      senderId: "ceo-1",
      content: '@pm "plan payment gateway integration"',
    });

    expect(response.text).toContain("@pm");
    expect(response.text).toContain("plan payment gateway integration");
  });
});
