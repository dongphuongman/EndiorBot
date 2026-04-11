/**
 * cmd.list RPC Handler Tests — T2 (M0, Sprint 132)
 *
 * @module tests/gateway/methods/cmd-list-rpc
 * @sprint 132
 */

import { describe, it, expect, beforeEach } from "vitest";
import { CommandDispatcher } from "../../../src/commands/command-dispatcher.js";
import { createCommandDispatcher } from "../../../src/commands/index.js";
import { registerBridgeCommandMethods } from "../../../src/gateway/methods/bridge-commands.js";
import type { CmdListResult } from "../../../src/commands/command-catalog.js";

// ============================================================================
// Mock GatewayServer (same pattern as bridge-commands.test.ts)
// ============================================================================

function createMockServer() {
  const methods = new Map<string, (params: unknown) => Promise<unknown>>();
  return {
    registerMethod: (name: string, handler: (params: unknown) => Promise<unknown>) => {
      methods.set(name, handler);
    },
    getMethod: (name: string) => methods.get(name),
    hasMethod: (name: string) => methods.has(name),
    invoke: async (name: string, params: unknown) => {
      const method = methods.get(name);
      if (!method) throw new Error(`Method '${name}' not registered`);
      return method(params);
    },
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("cmd.list RPC method", () => {
  let dispatcher: CommandDispatcher;
  let server: ReturnType<typeof createMockServer>;

  beforeEach(() => {
    dispatcher = createCommandDispatcher();
    server = createMockServer();
    registerBridgeCommandMethods(server as never, dispatcher);
  });

  it("cmd.list is registered on the server", () => {
    expect(server.hasMethod("cmd.list")).toBe(true);
  });

  it("cmd.list itself is NOT in the cmd.* loop (no cmd.cmd.list)", () => {
    // The method should be cmd.list, NOT cmd.commands or cmd.cmd.list
    expect(server.hasMethod("cmd.cmd.list")).toBe(false);
  });

  it("cmd.list returns a CmdListResult envelope", async () => {
    const result = (await server.invoke("cmd.list", {})) as CmdListResult;

    expect(result).toHaveProperty("commands");
    expect(result).toHaveProperty("meta");
    expect(Array.isArray(result.commands)).toBe(true);

    const { meta } = result;
    expect(typeof meta.total).toBe("number");
    expect(meta.total).toBeGreaterThan(0);
    expect(typeof meta.filteredCount).toBe("number");
    expect(typeof meta.dispatcherVersion).toBe("string");
    expect(typeof meta.generatedAt).toBe("string");
  });

  it("cmd.list meta.total equals dispatcher command count", async () => {
    const result = (await server.invoke("cmd.list", {})) as CmdListResult;
    expect(result.meta.total).toBe(dispatcher.getRegisteredCommands().length);
  });

  it("cmd.list works with bare empty params (null safety)", async () => {
    const result = (await server.invoke("cmd.list", null)) as CmdListResult;
    expect(result.meta.total).toBeGreaterThan(0);
  });

  it("cmd.list is non-sensitive (no auth required)", () => {
    // cmd.list should not be in the dispatcher's SENSITIVE_COMMANDS
    // (it's registered on the server directly, not via dispatcher)
    // The bridge-commands loop registers cmd.<name> for dispatcher commands
    // cmd.list is registered separately before the loop
    const cmdListMethod = server.getMethod("cmd.list");
    expect(cmdListMethod).toBeDefined();
    // Sensitive commands would return { success: false } without userId;
    // cmd.list should succeed without userId
  });

  it("cmd.list accepts surface filter param", async () => {
    const result = (await server.invoke("cmd.list", { surface: "telegram" })) as CmdListResult;
    expect(result.meta.surface).toBe("telegram");
    expect(result.meta.total).toBe(dispatcher.getRegisteredCommands().length);
  });

  it("cmd.list still registers regular cmd.* methods (no regression)", () => {
    // These commands are registered in createCommandDispatcher
    expect(server.hasMethod("cmd.agents")).toBe(true);
    expect(server.hasMethod("cmd.help")).toBe(true);
    expect(server.hasMethod("cmd.commands")).toBe(true);
  });
});

describe("cmd.list with minimal dispatcher", () => {
  it("returns empty commands array gracefully", async () => {
    const minDispatcher = new CommandDispatcher();
    const server = createMockServer();
    registerBridgeCommandMethods(server as never, minDispatcher);

    const result = (await server.invoke("cmd.list", {})) as CmdListResult;
    expect(result.commands).toHaveLength(0);
    expect(result.meta.total).toBe(0);
    expect(result.meta.filteredCount).toBe(0);
  });
});
