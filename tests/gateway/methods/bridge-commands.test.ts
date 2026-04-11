/**
 * Bridge Commands Gateway Methods Tests — Sprint 93
 *
 * Tests cmd.* Gateway method registration with auth checks.
 *
 * @module tests/gateway/methods/bridge-commands
 * @sprint 93
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  CommandDispatcher,
  type CommandContext,
} from "../../../src/commands/command-dispatcher.js";
import {
  registerBridgeCommandMethods,
  getBridgeCommandCount,
} from "../../../src/gateway/methods/bridge-commands.js";

// ============================================================================
// Mock GatewayServer
// ============================================================================

function createMockServer() {
  const methods = new Map<string, (params: unknown) => Promise<unknown>>();
  return {
    registerMethod: (name: string, handler: (params: unknown) => Promise<unknown>) => {
      methods.set(name, handler);
    },
    getMethod: (name: string) => methods.get(name),
    hasMethod: (name: string) => methods.has(name),
    getMethodCount: () => methods.size,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("registerBridgeCommandMethods", () => {
  let dispatcher: CommandDispatcher;
  let server: ReturnType<typeof createMockServer>;

  beforeEach(() => {
    dispatcher = new CommandDispatcher();
    server = createMockServer();

    // Register some commands
    dispatcher.register("agents", async () => ({
      success: true,
      response: "Agent list",
    }));
    dispatcher.register("launch", async (ctx: CommandContext) => ({
      success: true,
      response: `Launching for ${ctx.userId}`,
    }));
    dispatcher.register("help", async () => ({
      success: true,
      response: "Help text",
    }));
  });

  it("registers all commands as cmd.* methods", () => {
    registerBridgeCommandMethods(server as never, dispatcher);

    expect(server.hasMethod("cmd.agents")).toBe(true);
    expect(server.hasMethod("cmd.launch")).toBe(true);
    expect(server.hasMethod("cmd.help")).toBe(true);
    // M0 (Sprint 132): cmd.list is registered separately BEFORE the loop.
    // Total = 3 dispatcher commands + 1 for cmd.list.
    expect(server.hasMethod("cmd.list")).toBe(true);
    expect(server.getMethodCount()).toBe(4);
  });

  it("cmd.agents callable without userId (non-sensitive)", async () => {
    registerBridgeCommandMethods(server as never, dispatcher);

    const handler = server.getMethod("cmd.agents")!;
    const result = (await handler({})) as { success: boolean; response: string };

    expect(result).not.toBeNull();
    expect(result.success).toBe(true);
    expect(result.response).toBe("Agent list");
  });

  it("cmd.launch requires userId (sensitive command — R3)", async () => {
    registerBridgeCommandMethods(server as never, dispatcher);

    const handler = server.getMethod("cmd.launch")!;

    // Without userId → requires userId error
    const result = (await handler({})) as { success: boolean; response: string };
    expect(result.success).toBe(false);
    expect(result.response).toContain("requires userId");

    // With userId → dispatches successfully
    const result2 = (await handler({ userId: "user-1" })) as { success: boolean; response: string };
    expect(result2.success).toBe(true);
    expect(result2.response).toContain("user-1");
  });

  it("getBridgeCommandCount returns correct count", () => {
    expect(getBridgeCommandCount(dispatcher)).toBe(3);
  });
});
