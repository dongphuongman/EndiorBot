/**
 * CommandDispatcher Tests — Sprint 93
 *
 * @module tests/commands/command-dispatcher
 * @sprint 93
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  CommandDispatcher,
  SENSITIVE_COMMANDS,
  requireLinkedActor,
  type CommandContext,
  type CommandResult,
} from "../../src/commands/command-dispatcher.js";
import { createCommandDispatcher } from "../../src/commands/index.js";

describe("CommandDispatcher", () => {
  let dispatcher: CommandDispatcher;

  beforeEach(() => {
    dispatcher = new CommandDispatcher();
  });

  it("registers and dispatches a command", async () => {
    dispatcher.register("hello", async () => ({
      success: true,
      response: "Hello, world!",
    }));

    const ctx: CommandContext = {
      userId: "user-1",
      args: [],
      channel: "test",
    };

    const result = await dispatcher.dispatch("hello", ctx);
    expect(result).not.toBeNull();
    expect(result!.success).toBe(true);
    expect(result!.response).toBe("Hello, world!");
  });

  it("returns null for unknown command", async () => {
    const ctx: CommandContext = {
      userId: "user-1",
      args: [],
      channel: "test",
    };

    const result = await dispatcher.dispatch("nonexistent", ctx);
    expect(result).toBeNull();
  });

  it("has() checks command registration", () => {
    dispatcher.register("test", async () => ({
      success: true,
      response: "ok",
    }));

    expect(dispatcher.has("test")).toBe(true);
    expect(dispatcher.has("TEST")).toBe(true); // case-insensitive
    expect(dispatcher.has("missing")).toBe(false);
  });

  it("isSensitive() identifies security-sensitive commands", () => {
    expect(dispatcher.isSensitive("launch")).toBe(true);
    expect(dispatcher.isSensitive("kill")).toBe(true);
    expect(dispatcher.isSensitive("sh")).toBe(true);
    expect(dispatcher.isSensitive("agents")).toBe(false);
    expect(dispatcher.isSensitive("help")).toBe(false);
  });

  it("requiresLink() identifies linked commands", () => {
    expect(dispatcher.requiresLink("launch")).toBe(true);
    expect(dispatcher.requiresLink("sessions")).toBe(true);
    expect(dispatcher.requiresLink("agents")).toBe(false);
  });

  it("passes context through correctly", async () => {
    let capturedCtx: CommandContext | null = null;

    dispatcher.register("test", async (ctx) => {
      capturedCtx = ctx;
      return { success: true, response: "ok" };
    });

    const ctx: CommandContext = {
      userId: "user-42",
      username: "ceo",
      args: ["arg1", "arg2"],
      channel: "telegram",
      chatId: "chat-123",
    };

    await dispatcher.dispatch("test", ctx);
    expect(capturedCtx).not.toBeNull();
    expect(capturedCtx!.userId).toBe("user-42");
    expect(capturedCtx!.username).toBe("ceo");
    expect(capturedCtx!.args).toEqual(["arg1", "arg2"]);
    expect(capturedCtx!.channel).toBe("telegram");
    expect(capturedCtx!.chatId).toBe("chat-123");
  });
});

describe("createCommandDispatcher factory", () => {
  it("registers all expected commands", () => {
    const dispatcher = createCommandDispatcher();
    const commands = dispatcher.getRegisteredCommands();

    // Should have at least 17 commands (plan requirement)
    expect(commands.length).toBeGreaterThanOrEqual(17);

    // Verify key commands exist
    expect(dispatcher.has("agents")).toBe(true);
    expect(dispatcher.has("help")).toBe(true);
    expect(dispatcher.has("link")).toBe(true);
    expect(dispatcher.has("launch")).toBe(true);
    expect(dispatcher.has("sessions")).toBe(true);
    expect(dispatcher.has("kill")).toBe(true);
    expect(dispatcher.has("repos")).toBe(true);
    expect(dispatcher.has("sh")).toBe(true);
    expect(dispatcher.has("run")).toBe(true);
  });
});

describe("requireLinkedActor", () => {
  it("returns actorId when linked", () => {
    const ctx: CommandContext = {
      userId: "user-1",
      args: [],
      channel: "test",
    };

    const getLinkedActorId = (userId: string) =>
      userId === "user-1" ? "actor-1" : null;

    const result = requireLinkedActor(ctx, getLinkedActorId);
    expect("actorId" in result).toBe(true);
    expect((result as { actorId: string }).actorId).toBe("actor-1");
  });

  it("returns error when not linked", () => {
    const ctx: CommandContext = {
      userId: "unlinked-user",
      args: [],
      channel: "test",
    };

    const getLinkedActorId = () => null;

    const result = requireLinkedActor(ctx, getLinkedActorId);
    expect("response" in result).toBe(true);
    expect((result as CommandResult).success).toBe(false);
    expect((result as CommandResult).response).toContain("/link");
  });
});

describe("SENSITIVE_COMMANDS", () => {
  it("includes expected security-sensitive commands", () => {
    expect(SENSITIVE_COMMANDS.has("launch")).toBe(true);
    expect(SENSITIVE_COMMANDS.has("kill")).toBe(true);
    expect(SENSITIVE_COMMANDS.has("sh")).toBe(true);
    expect(SENSITIVE_COMMANDS.has("run")).toBe(true);
    expect(SENSITIVE_COMMANDS.has("cp")).toBe(true);
    expect(SENSITIVE_COMMANDS.has("attach")).toBe(true);
    expect(SENSITIVE_COMMANDS.has("link")).toBe(true);
  });

  it("does not include info commands", () => {
    expect(SENSITIVE_COMMANDS.has("agents")).toBe(false);
    expect(SENSITIVE_COMMANDS.has("help")).toBe(false);
    expect(SENSITIVE_COMMANDS.has("config")).toBe(false);
  });
});
