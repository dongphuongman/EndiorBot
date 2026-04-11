/**
 * Five-Equal-Numbers Invariant Test — T4 (M0, Sprint 132)
 *
 * PoL acceptance criterion: all four surfaces return the same meta.total.
 * The fifth reference number is dispatcher.getRegisteredCommands().length.
 *
 * Four paths tested:
 *   (a) Dispatcher ground truth:  dispatcher.getRegisteredCommands().length
 *   (b) RPC handler:              cmd.list via in-process mock server
 *   (c) CLI code path:            buildCmdListResult() directly (no HTTP)
 *   (d) OTT Telegram path:        dispatcher.dispatch("commands", ctx{channel:"telegram"})
 *   (e) OTT Zalo path:            dispatcher.dispatch("commands", ctx{channel:"zalo"})
 *
 * All five numbers MUST be equal.
 *
 * @module tests/commands/five-equal-numbers
 * @sprint 132
 */

import { describe, it, expect } from "vitest";
import { createCommandDispatcher } from "../../src/commands/index.js";
import { registerBridgeCommandMethods } from "../../src/gateway/methods/bridge-commands.js";
import {
  buildCmdListResult,
  type CmdListResult,
} from "../../src/commands/command-catalog.js";
import type { CommandContext } from "../../src/commands/command-dispatcher.js";

// ============================================================================
// Mock server (in-process, no real HTTP)
// ============================================================================

function createMockServer() {
  const methods = new Map<string, (params: unknown) => Promise<unknown>>();
  return {
    registerMethod: (name: string, handler: (params: unknown) => Promise<unknown>) => {
      methods.set(name, handler);
    },
    invoke: async (name: string, params: unknown) => {
      const method = methods.get(name);
      if (!method) throw new Error(`Method '${name}' not registered`);
      return method(params);
    },
  };
}

// ============================================================================
// PoL Test
// ============================================================================

describe("Five-Equal-Numbers PoL invariant", () => {
  it("all five numbers are equal across surfaces", async () => {
    // One shared dispatcher — all surfaces enumerate the same command registry
    const dispatcher = createCommandDispatcher();

    // ── (a) Dispatcher ground truth ──
    const groundTruth = dispatcher.getRegisteredCommands().length;

    // ── (b) RPC handler path (Web surface) ──
    const server = createMockServer();
    registerBridgeCommandMethods(server as never, dispatcher);
    const rpcResult = (await server.invoke("cmd.list", {})) as CmdListResult;
    const rpcTotal = rpcResult.meta.total;

    // ── (c) CLI code path (direct function call, no HTTP) ──
    const cliResult = buildCmdListResult(dispatcher);
    const cliTotal = cliResult.meta.total;

    // ── (d) OTT Telegram path ──
    const telegramCtx: CommandContext = {
      userId: "telegram-user-1",
      args: [],
      channel: "telegram",
    };
    const telegramResult = await dispatcher.dispatch("commands", telegramCtx);
    expect(telegramResult).not.toBeNull();
    // Parse total from rendered text: "Total: N commands"
    const telegramTotalMatch = telegramResult!.response.match(/Total:\s+(\d+)/);
    expect(telegramTotalMatch).not.toBeNull();
    const telegramTotal = parseInt(telegramTotalMatch![1], 10);

    // ── (e) OTT Zalo path ──
    const zaloCtx: CommandContext = {
      userId: "zalo-user-1",
      args: [],
      channel: "zalo",
    };
    const zaloResult = await dispatcher.dispatch("commands", zaloCtx);
    expect(zaloResult).not.toBeNull();
    const zaloTotalMatch = zaloResult!.response.match(/Total:\s+(\d+)/);
    expect(zaloTotalMatch).not.toBeNull();
    const zaloTotal = parseInt(zaloTotalMatch![1], 10);

    // ── Invariant assertion: all five numbers equal ──
    expect(rpcTotal).toBe(groundTruth);
    expect(cliTotal).toBe(groundTruth);
    expect(telegramTotal).toBe(groundTruth);
    expect(zaloTotal).toBe(groundTruth);
  });

  it("meta.total is UNFILTERED (invariant to surface param)", async () => {
    const dispatcher = createCommandDispatcher();
    const groundTruth = dispatcher.getRegisteredCommands().length;

    const surfaces = ["web", "telegram", "zalo", "cli"] as const;
    for (const surface of surfaces) {
      const result = buildCmdListResult(dispatcher, { surface });
      expect(result.meta.total).toBe(groundTruth);
    }
  });

  it("OTT commands handler returns success: true for telegram and zalo", async () => {
    const dispatcher = createCommandDispatcher();
    const ctx: CommandContext = { userId: "u1", args: [], channel: "telegram" };

    const result = await dispatcher.dispatch("commands", ctx);
    expect(result).not.toBeNull();
    expect(result!.success).toBe(true);
    expect(result!.format).toBe("markdown");
  });

  it("'commands' is registered in dispatcher", () => {
    const dispatcher = createCommandDispatcher();
    expect(dispatcher.has("commands")).toBe(true);
  });

  it("'commands' is not sensitive and does not require link", () => {
    const dispatcher = createCommandDispatcher();
    expect(dispatcher.isSensitive("commands")).toBe(false);
    expect(dispatcher.requiresLink("commands")).toBe(false);
  });
});
