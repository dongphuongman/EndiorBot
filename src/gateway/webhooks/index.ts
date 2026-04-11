/**
 * Webhook module — public API
 * @module gateway/webhooks
 */
export { TriggerRegistry } from "./trigger-registry.js";
export { handleWebhookRequest } from "./webhook-router.js";
export type {
  WebhookTrigger,
  WebhookPayload,
  WebhookConfig,
  WebhookAuditRecord,
  TriggerHandler,
} from "./types.js";
