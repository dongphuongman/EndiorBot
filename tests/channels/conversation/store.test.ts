/**
 * ConversationStore Tests
 *
 * @module tests/channels/conversation/store
 * @sprint 78
 * @authority ADR-021
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  ConversationStore,
  getConversationStore,
  resetConversationStore,
  DEFAULT_MAX_TURNS,
  type ConversationTurn,
} from "../../../src/channels/conversation/store.js";

// ============================================================================
// Tests: add() + get()
// ============================================================================

describe("ConversationStore.add() + get()", () => {
  let store: ConversationStore;

  beforeEach(() => {
    store = new ConversationStore();
  });

  it("stores and retrieves a user turn", () => {
    store.add("chat-1", "user", "hello");
    const turns = store.get("chat-1");
    expect(turns).toHaveLength(1);
    expect(turns[0].role).toBe("user");
    expect(turns[0].content).toBe("hello");
  });

  it("stores and retrieves an assistant turn", () => {
    store.add("chat-1", "assistant", "world");
    const turns = store.get("chat-1");
    expect(turns[0].role).toBe("assistant");
    expect(turns[0].content).toBe("world");
  });

  it("preserves chronological order (oldest first)", () => {
    store.add("chat-1", "user", "msg1");
    store.add("chat-1", "assistant", "msg2");
    store.add("chat-1", "user", "msg3");
    const turns = store.get("chat-1");
    expect(turns[0].content).toBe("msg1");
    expect(turns[1].content).toBe("msg2");
    expect(turns[2].content).toBe("msg3");
  });

  it("records timestamp on each turn", () => {
    const before = new Date();
    store.add("chat-1", "user", "hello");
    const after = new Date();
    const turn = store.get("chat-1")[0];
    expect(turn.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(turn.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it("returns empty array for unknown chatId", () => {
    expect(store.get("unknown-chat")).toEqual([]);
  });

  it("keeps different chats separate", () => {
    store.add("chat-A", "user", "hello from A");
    store.add("chat-B", "user", "hello from B");
    expect(store.get("chat-A")[0].content).toBe("hello from A");
    expect(store.get("chat-B")[0].content).toBe("hello from B");
  });

  it("accumulated turns from multiple adds", () => {
    for (let i = 0; i < 5; i++) {
      store.add("chat-1", "user", `msg-${i}`);
    }
    expect(store.get("chat-1")).toHaveLength(5);
  });
});

// ============================================================================
// Tests: maxTurns enforcement
// ============================================================================

describe("ConversationStore maxTurns enforcement", () => {
  it("default maxTurns is 10", () => {
    expect(DEFAULT_MAX_TURNS).toBe(10);
  });

  it("evicts oldest turn when 11th turn is added", () => {
    const store = new ConversationStore(10);
    for (let i = 0; i < 10; i++) {
      store.add("chat-1", "user", `msg-${i}`);
    }
    store.add("chat-1", "user", "msg-10");

    const turns = store.get("chat-1");
    expect(turns).toHaveLength(10);
    expect(turns[0].content).toBe("msg-1"); // msg-0 evicted
    expect(turns[9].content).toBe("msg-10");
  });

  it("keeps exactly maxTurns after many adds", () => {
    const store = new ConversationStore(5);
    for (let i = 0; i < 20; i++) {
      store.add("chat-1", i % 2 === 0 ? "user" : "assistant", `msg-${i}`);
    }
    const turns = store.get("chat-1");
    expect(turns).toHaveLength(5);
    expect(turns[0].content).toBe("msg-15");
    expect(turns[4].content).toBe("msg-19");
  });

  it("custom maxTurns respected", () => {
    const store = new ConversationStore(3);
    store.add("chat-1", "user", "a");
    store.add("chat-1", "user", "b");
    store.add("chat-1", "user", "c");
    store.add("chat-1", "user", "d");
    const turns = store.get("chat-1");
    expect(turns).toHaveLength(3);
    expect(turns[0].content).toBe("b");
  });

  it("maxTurns=1 keeps only the last turn", () => {
    const store = new ConversationStore(1);
    store.add("chat-1", "user", "first");
    store.add("chat-1", "user", "second");
    const turns = store.get("chat-1");
    expect(turns).toHaveLength(1);
    expect(turns[0].content).toBe("second");
  });
});

// ============================================================================
// Tests: size()
// ============================================================================

describe("ConversationStore.size()", () => {
  let store: ConversationStore;

  beforeEach(() => {
    store = new ConversationStore();
  });

  it("returns 0 for unknown chatId", () => {
    expect(store.size("no-such-chat")).toBe(0);
  });

  it("returns accurate count after adds", () => {
    store.add("chat-1", "user", "a");
    store.add("chat-1", "user", "b");
    expect(store.size("chat-1")).toBe(2);
  });

  it("returns capped count after exceeding maxTurns", () => {
    const store2 = new ConversationStore(3);
    for (let i = 0; i < 10; i++) store2.add("chat-1", "user", `msg-${i}`);
    expect(store2.size("chat-1")).toBe(3);
  });
});

// ============================================================================
// Tests: clear()
// ============================================================================

describe("ConversationStore.clear()", () => {
  let store: ConversationStore;

  beforeEach(() => {
    store = new ConversationStore();
  });

  it("empties a specific chat", () => {
    store.add("chat-1", "user", "hello");
    store.clear("chat-1");
    expect(store.get("chat-1")).toEqual([]);
    expect(store.size("chat-1")).toBe(0);
  });

  it("does not affect other chats", () => {
    store.add("chat-1", "user", "hello");
    store.add("chat-2", "user", "world");
    store.clear("chat-1");
    expect(store.get("chat-1")).toEqual([]);
    expect(store.get("chat-2")).toHaveLength(1);
  });

  it("is idempotent on empty chat", () => {
    store.clear("nonexistent");
    expect(store.get("nonexistent")).toEqual([]);
  });

  it("allows adding again after clear", () => {
    store.add("chat-1", "user", "before");
    store.clear("chat-1");
    store.add("chat-1", "user", "after");
    const turns = store.get("chat-1");
    expect(turns).toHaveLength(1);
    expect(turns[0].content).toBe("after");
  });
});

// ============================================================================
// Tests: clearAll()
// ============================================================================

describe("ConversationStore.clearAll()", () => {
  let store: ConversationStore;

  beforeEach(() => {
    store = new ConversationStore();
  });

  it("empties all chats", () => {
    store.add("chat-1", "user", "hello");
    store.add("chat-2", "user", "world");
    store.add("chat-3", "assistant", "foo");
    store.clearAll();
    expect(store.get("chat-1")).toEqual([]);
    expect(store.get("chat-2")).toEqual([]);
    expect(store.get("chat-3")).toEqual([]);
    expect(store.chatCount()).toBe(0);
  });

  it("is idempotent on empty store", () => {
    store.clearAll();
    expect(store.chatCount()).toBe(0);
  });
});

// ============================================================================
// Tests: chatCount()
// ============================================================================

describe("ConversationStore.chatCount()", () => {
  let store: ConversationStore;

  beforeEach(() => {
    store = new ConversationStore();
  });

  it("returns 0 on empty store", () => {
    expect(store.chatCount()).toBe(0);
  });

  it("returns number of distinct chats", () => {
    store.add("chat-1", "user", "a");
    store.add("chat-2", "user", "b");
    store.add("chat-1", "user", "c"); // same chat, still 2
    expect(store.chatCount()).toBe(2);
  });

  it("decrements when chat cleared", () => {
    store.add("chat-1", "user", "a");
    store.add("chat-2", "user", "b");
    store.clear("chat-1");
    expect(store.chatCount()).toBe(1);
  });
});

// ============================================================================
// Tests: hasHistory()
// ============================================================================

describe("ConversationStore.hasHistory()", () => {
  let store: ConversationStore;

  beforeEach(() => {
    store = new ConversationStore();
  });

  it("returns false for unknown chatId", () => {
    expect(store.hasHistory("no-such-chat")).toBe(false);
  });

  it("returns true after adding a turn", () => {
    store.add("chat-1", "user", "hello");
    expect(store.hasHistory("chat-1")).toBe(true);
  });

  it("returns false after clear", () => {
    store.add("chat-1", "user", "hello");
    store.clear("chat-1");
    expect(store.hasHistory("chat-1")).toBe(false);
  });
});

// ============================================================================
// Tests: singleton
// ============================================================================

describe("getConversationStore() singleton", () => {
  afterEach(() => {
    resetConversationStore();
  });

  it("returns same instance on multiple calls", () => {
    const a = getConversationStore();
    const b = getConversationStore();
    expect(a).toBe(b);
  });

  it("resetConversationStore() creates fresh instance", () => {
    const a = getConversationStore();
    resetConversationStore();
    const b = getConversationStore();
    expect(a).not.toBe(b);
  });

  it("fresh instance has no history", () => {
    const store = getConversationStore();
    store.add("chat-1", "user", "hello");
    resetConversationStore();
    const fresh = getConversationStore();
    expect(fresh.get("chat-1")).toEqual([]);
  });
});

// ============================================================================
// Tests: type safety
// ============================================================================

describe("ConversationStore type safety", () => {
  it("ConversationTurn has required fields", () => {
    const store = new ConversationStore();
    store.add("chat-1", "user", "test content");
    const turn: ConversationTurn = store.get("chat-1")[0];
    expect(turn.role).toBeDefined();
    expect(turn.content).toBeDefined();
    expect(turn.timestamp).toBeInstanceOf(Date);
  });

  it("handles empty string content", () => {
    const store = new ConversationStore();
    store.add("chat-1", "user", "");
    expect(store.get("chat-1")[0].content).toBe("");
  });

  it("handles Vietnamese content (CEO use case)", () => {
    const store = new ConversationStore();
    store.add("chat-1", "user", "viết hàm sắp xếp mảng");
    store.add("chat-1", "assistant", "Tôi sẽ giúp bạn viết hàm sắp xếp.");
    const turns = store.get("chat-1");
    expect(turns[0].content).toBe("viết hàm sắp xếp mảng");
    expect(turns[1].content).toBe("Tôi sẽ giúp bạn viết hàm sắp xếp.");
  });

  it("handles long content", () => {
    const store = new ConversationStore();
    const longContent = "x".repeat(10000);
    store.add("chat-1", "user", longContent);
    expect(store.get("chat-1")[0].content).toBe(longContent);
  });
});
