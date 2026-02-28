/**
 * Zalo Bot API Client
 *
 * API client for Zalo Bot Platform (Zapps.me / bot.zaloplatforms.com).
 * This is for PERSONAL Zalo accounts via bot platform, not Official Accounts.
 *
 * Ported from openclaw/extensions/zalo/src/api.ts
 *
 * @module channels/zalo/zalo-bot-api
 * @version 1.0.0
 * @date 2026-02-28
 * @status ACTIVE - Sprint 51
 * @authority ADR-005 Python-to-TypeScript Porting
 * @stage 04 - BUILD
 */

// ============================================================================
// Constants
// ============================================================================

/**
 * Zalo Bot Platform API base URL.
 * Using zapps.me endpoint (consistent with picoclaw).
 * Alternative: https://bot-api.zaloplatforms.com (same service, different domain)
 */
export const ZALO_BOT_API_BASE = "https://bot-api.zapps.me";

// ============================================================================
// Types
// ============================================================================

/**
 * Zalo Bot API response.
 */
export interface ZaloBotApiResponse<T = unknown> {
  ok: boolean;
  result?: T;
  error_code?: number;
  description?: string;
}

/**
 * Zalo Bot info (getMe response).
 */
export interface ZaloBotInfo {
  id: string;
  name: string;
  avatar?: string;
}

/**
 * Zalo message.
 */
export interface ZaloBotMessage {
  message_id: string;
  from: {
    id: string;
    name?: string;
    avatar?: string;
  };
  chat: {
    id: string;
    chat_type: "PRIVATE" | "GROUP";
  };
  date: number;
  text?: string;
  photo?: string;
  caption?: string;
  sticker?: string;
}

/**
 * Zalo update event.
 */
export interface ZaloBotUpdate {
  event_name:
    | "message.text.received"
    | "message.image.received"
    | "message.sticker.received"
    | "message.unsupported.received";
  message?: ZaloBotMessage;
}

/**
 * Parameters for sendMessage.
 */
export interface ZaloBotSendMessageParams {
  chat_id: string;
  text: string;
}

/**
 * Parameters for sendPhoto.
 */
export interface ZaloBotSendPhotoParams {
  chat_id: string;
  photo: string;
  caption?: string;
}

/**
 * Parameters for setWebhook.
 */
export interface ZaloBotSetWebhookParams {
  url: string;
  secret_token: string;
}

/**
 * Parameters for getUpdates.
 */
export interface ZaloBotGetUpdatesParams {
  /** Timeout in seconds (passed as string to API) */
  timeout?: number;
}

// ============================================================================
// Errors
// ============================================================================

/**
 * Zalo Bot API error.
 */
export class ZaloBotApiError extends Error {
  constructor(
    message: string,
    public readonly errorCode?: number,
    public readonly description?: string,
  ) {
    super(message);
    this.name = "ZaloBotApiError";
  }

  /** True if this is a long-polling timeout (no updates available) */
  get isPollingTimeout(): boolean {
    return this.errorCode === 408;
  }
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * Call the Zalo Bot API.
 *
 * @param method - API method name
 * @param token - Bot token (format: botId:secretPart)
 * @param body - Request body
 * @param options - Request options
 */
export async function callZaloBotApi<T = unknown>(
  method: string,
  token: string,
  body?: Record<string, unknown>,
  options?: { timeoutMs: number },
): Promise<ZaloBotApiResponse<T>> {
  const url = `${ZALO_BOT_API_BASE}/bot${token}/${method}`;
  const controller = new AbortController();
  const timeoutId = options?.timeoutMs
    ? setTimeout(() => controller.abort(), options.timeoutMs)
    : undefined;

  try {
    const requestInit: RequestInit = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      signal: controller.signal,
    };

    if (body) {
      requestInit.body = JSON.stringify(body);
    }

    const response = await fetch(url, requestInit);
    const data = (await response.json()) as ZaloBotApiResponse<T>;

    if (!data.ok) {
      throw new ZaloBotApiError(
        data.description ?? `Zalo Bot API error: ${method}`,
        data.error_code,
        data.description,
      );
    }

    return data;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

/**
 * Validate bot token and get bot info.
 *
 * @param token - Bot token
 * @param timeoutMs - Request timeout in milliseconds
 */
export async function getMe(
  token: string,
  timeoutMs?: number,
): Promise<ZaloBotApiResponse<ZaloBotInfo>> {
  const options = timeoutMs !== undefined ? { timeoutMs } : undefined;
  return callZaloBotApi<ZaloBotInfo>("getMe", token, undefined, options);
}

/**
 * Send a text message.
 *
 * @param token - Bot token
 * @param params - Send message parameters
 */
export async function sendMessage(
  token: string,
  params: ZaloBotSendMessageParams,
): Promise<ZaloBotApiResponse<ZaloBotMessage>> {
  return callZaloBotApi<ZaloBotMessage>("sendMessage", token, {
    chat_id: params.chat_id,
    text: params.text,
  });
}

/**
 * Send a photo message.
 *
 * @param token - Bot token
 * @param params - Send photo parameters
 */
export async function sendPhoto(
  token: string,
  params: ZaloBotSendPhotoParams,
): Promise<ZaloBotApiResponse<ZaloBotMessage>> {
  const body: Record<string, unknown> = {
    chat_id: params.chat_id,
    photo: params.photo,
  };
  if (params.caption) {
    body.caption = params.caption;
  }
  return callZaloBotApi<ZaloBotMessage>("sendPhoto", token, body);
}

/**
 * Get updates using long polling (dev/testing only).
 * Note: Zalo returns a single update per call, not an array like Telegram.
 *
 * @param token - Bot token
 * @param params - Get updates parameters
 */
export async function getUpdates(
  token: string,
  params?: ZaloBotGetUpdatesParams,
): Promise<ZaloBotApiResponse<ZaloBotUpdate>> {
  const pollTimeoutSec = params?.timeout ?? 30;
  const timeoutMs = (pollTimeoutSec + 5) * 1000;
  const body = { timeout: String(pollTimeoutSec) };
  return callZaloBotApi<ZaloBotUpdate>("getUpdates", token, body, { timeoutMs });
}

/**
 * Set webhook URL for receiving updates.
 *
 * @param token - Bot token
 * @param params - Set webhook parameters
 */
export async function setWebhook(
  token: string,
  params: ZaloBotSetWebhookParams,
): Promise<ZaloBotApiResponse<boolean>> {
  return callZaloBotApi<boolean>("setWebhook", token, {
    url: params.url,
    secret_token: params.secret_token,
  });
}

/**
 * Delete webhook configuration.
 *
 * @param token - Bot token
 */
export async function deleteWebhook(
  token: string,
): Promise<ZaloBotApiResponse<boolean>> {
  return callZaloBotApi<boolean>("deleteWebhook", token);
}

/**
 * Get current webhook info.
 *
 * @param token - Bot token
 */
export async function getWebhookInfo(
  token: string,
): Promise<ZaloBotApiResponse<{ url?: string; has_custom_certificate?: boolean }>> {
  return callZaloBotApi("getWebhookInfo", token);
}
