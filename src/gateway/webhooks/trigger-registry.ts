/**
 * Webhook Trigger Registry
 *
 * Maintains a map of named triggers and dispatches incoming payloads.
 *
 * @module gateway/webhooks/trigger-registry
 * @version 1.0.0
 * @date 2026-04-11
 * @status ACTIVE — Sprint 134 Task 4
 */

import type { WebhookTrigger, WebhookPayload, TriggerHandler } from "./types.js";

// ============================================================================
// Registry
// ============================================================================

export class TriggerRegistry {
  private triggers = new Map<string, WebhookTrigger>();

  /** Register a named trigger. Overwrites if name already exists. */
  register(name: string, handler: TriggerHandler, description?: string): void {
    const trigger: WebhookTrigger = {
      name,
      handler,
      createdAt: Date.now(),
    };
    if (description) trigger.description = description;
    this.triggers.set(name, trigger);
  }

  /** Unregister a trigger by name. Returns true if it existed. */
  unregister(name: string): boolean {
    return this.triggers.delete(name);
  }

  /** Dispatch a payload to the named trigger. Throws if not found. */
  async dispatch(name: string, payload: WebhookPayload): Promise<void> {
    const trigger = this.triggers.get(name);
    if (!trigger) {
      throw new Error(`Trigger "${name}" not found`);
    }
    await trigger.handler(payload);
  }

  /** Check if a trigger exists. */
  has(name: string): boolean {
    return this.triggers.has(name);
  }

  /** List all registered triggers (name + description + createdAt). */
  list(): Array<{ name: string; description?: string; createdAt: number }> {
    return Array.from(this.triggers.values()).map(t => {
      const entry: { name: string; description?: string; createdAt: number } = {
        name: t.name,
        createdAt: t.createdAt,
      };
      if (t.description) entry.description = t.description;
      return entry;
    });
  }

  /** Number of registered triggers. */
  get size(): number {
    return this.triggers.size;
  }
}
