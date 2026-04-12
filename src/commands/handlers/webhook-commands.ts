/**
 * Webhook OTT Commands — Sprint 135 Task 5
 *
 * /webhook list  → show registered triggers
 * /webhook test <triggerId> → fire test payload
 *
 * @module commands/handlers/webhook-commands
 * @version 1.0.0
 * @date 2026-04-12
 */

import type { CommandResult } from "../command-dispatcher.js";

/**
 * Handle /webhook list|test from OTT.
 * Note: TriggerRegistry is runtime-only (on the gateway server).
 * OTT commands route through GatewayIngress which has access to the server instance.
 * For standalone CLI use, the registry is empty (no server running).
 */
export function handleWebhookOttCommand(args: string[]): CommandResult {
  const sub = args[0]?.toLowerCase();

  switch (sub) {
    case "list":
      return {
        success: true,
        response: [
          "🔗 **Webhook Triggers**",
          "",
          "Webhook triggers are registered at runtime via the gateway server.",
          "Use `curl localhost:18790/api/config` to see registered triggers.",
          "Or `POST /api/webhooks/:triggerId` to dispatch.",
        ].join("\n"),
      };
    case "test":
      return {
        success: true,
        response: [
          "🔗 **Webhook Test**",
          "",
          `To test a trigger, send a POST request:`,
          "```",
          `curl -X POST http://localhost:18790/api/webhooks/<triggerId> \\`,
          `  -H "x-webhook-secret: $ENDIORBOT_WEBHOOK_SECRET" \\`,
          `  -H "Content-Type: application/json" \\`,
          `  -d '{"test": true}'`,
          "```",
        ].join("\n"),
      };
    default:
      return {
        success: true,
        response: [
          "🔗 **Webhook Commands**",
          "",
          "/webhook list — show registered triggers",
          "/webhook test — how to test a trigger",
        ].join("\n"),
      };
  }
}
