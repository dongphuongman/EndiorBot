# OTT Channels Documentation

**Sprint 51 | EndiorBot Bidirectional Messaging**

## Overview

EndiorBot supports bidirectional messaging channels for CEO escalation and command processing. Channels implement the `BidirectionalChannel` interface enabling two-way communication.

## Current Status (Sprint 51)

| Channel | Status | Endpoint | Protocol |
|---------|--------|----------|----------|
| **Web** | ✅ READY | `http://localhost:18790` | WebSocket + JSON-RPC 2.0 |
| **Telegram** | ✅ READY | @Endior_bot | Telegram Bot API |
| **Zalo Bot** | ✅ READY | Bot Endior | Zalo Bot Platform API |
| Zalo OA | ⏸️ Legacy | - | - |

## Channel Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    EndiorBot Gateway                            │
│                    localhost:18790                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │               Channel Router                             │   │
│  │                                                          │   │
│  │   Incoming Message → Detect Channel → Route to Handler   │   │
│  │   Outgoing Message → Select Channel → Deliver            │   │
│  └─────────────────────────────────────────────────────────┘   │
│                           │                                     │
│         ┌─────────────────┼─────────────────┐                   │
│         ▼                 ▼                 ▼                   │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐           │
│  │    Web      │   │  Telegram   │   │  Zalo Bot   │           │
│  │   Channel   │   │   Channel   │   │   Channel   │           │
│  │             │   │             │   │             │           │
│  │ WebSocket   │   │ Bot API     │   │ Bot API     │           │
│  │ JSON-RPC    │   │ Long Poll   │   │ Long Poll   │           │
│  └─────────────┘   └─────────────┘   └─────────────┘           │
│         │                 │                 │                   │
└─────────┼─────────────────┼─────────────────┼───────────────────┘
          ▼                 ▼                 ▼
    ┌──────────┐      ┌──────────┐      ┌──────────┐
    │ Browser  │      │ Telegram │      │   Zalo   │
    │   User   │      │   User   │      │   User   │
    └──────────┘      └──────────┘      └──────────┘
```

## Environment Variables

```bash
# .env.local configuration

# Telegram Bot
TELEGRAM_BOT_TOKEN=<your-telegram-bot-token>
TELEGRAM_CHAT_ID=<your-telegram-chat-id>

# Zalo Bot (from Zalo Bot Manager - zapps.me)
ZALO_BOT_TOKEN=<your-zalo-bot-token>
ZALO_BOT_CHAT_ID=<your-zalo-chat-id>
```

---

## Telegram Setup

### 1. Create Telegram Bot

1. Open Telegram and search for [@BotFather](https://t.me/BotFather)
2. Send `/newbot` and follow the prompts
3. Copy the **Bot Token** (format: `123456789:ABCdefGHIjklMNOpqrSTUvwxYZ`)

### 2. Get Your Chat ID

1. Start a chat with your new bot
2. Send any message to the bot
3. Visit: `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates`
4. Find `"chat":{"id": 1234567890}` in the response

### 3. Test Connection

```bash
# Verify bot
curl https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getMe

# Send test message
curl -X POST https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendMessage \
  -H "Content-Type: application/json" \
  -d '{"chat_id": "'$TELEGRAM_CHAT_ID'", "text": "Hello from EndiorBot!"}'
```

---

## Zalo Bot Setup (Zapps.me)

The Zalo Bot Platform lets you create a Zalo Personal bot via [Zalo Bot Manager](https://bot.zapps.me/).

> **Note:** Zalo Bot ≠ Zalo OA. These are two different systems.

### 1. Create Zalo Bot

1. Sign in to [Zalo Bot Manager](https://bot.zapps.me/)
2. Scan the QR code with the Zalo app
3. Create a new bot and copy the **Bot Token** (format: `{bot_id}:{secret_key}`)

### 2. Get CEO Chat ID

**Option 1: From existing EndiorBot config**
```bash
# If you already have a config, read channel settings
cat ~/.endiorbot/config.json | jq '.channels.zalo'
```

**Option 2: From Zalo Bot Manager Dashboard**
1. Sign in to [bot.zapps.me](https://bot.zapps.me)
2. Open conversation history
3. Copy User ID / Chat ID

**Option 3: Polling (may be unsupported on BASIC accounts)**
```bash
# getUpdates often times out on BASIC accounts
# Prefer webhook mode or options 1/2
```

### 3. Test Connection

```bash
# Set variables
export ZALO_BOT_TOKEN="<your-zalo-bot-token>"
export ZALO_BOT_CHAT_ID="<your-zalo-chat-id>"

# Verify bot
curl -X POST "https://bot-api.zaloplatforms.com/bot$ZALO_BOT_TOKEN/getMe" \
  -H "Content-Type: application/json"

# Send message
curl -X POST "https://bot-api.zaloplatforms.com/bot$ZALO_BOT_TOKEN/sendMessage" \
  -H "Content-Type: application/json" \
  -d '{"chat_id": "'$ZALO_BOT_CHAT_ID'", "text": "Hello from EndiorBot!"}'
```

### 4. API Reference

| Method | Description |
|--------|-------------|
| `getMe` | Get bot info |
| `getUpdates` | Long polling (BASIC: limited) |
| `sendMessage` | Send text message |
| `sendPhoto` | Send image |
| `setWebhook` | Set webhook URL |
| `deleteWebhook` | Remove webhook |

### 5. Important Notes

- **Token expiration**: Tokens may expire; refresh from Bot Manager
- **BASIC vs PRO**: BASIC accounts have limited `getUpdates` polling
- **API Endpoints**:
  - `https://bot-api.zaloplatforms.com` (official)
  - `https://bot-api.zapps.me` (alternative)
- **Chat ID format**: Hex string (e.g., `e0c2caf9ebba02e45bab`)

---

## Architecture

### Channel Interface

```typescript
interface BidirectionalChannel extends IChannel {
  receive(): Promise<IncomingMessage[]>;
  onMessage(handler: IncomingMessageHandler): void;
  offMessage(): void;
  start(): Promise<void>;
  stop(): Promise<void>;
  isReceiving(): boolean;
}
```

### Source Files

| File | Description |
|------|-------------|
| `src/channels/telegram/` | Telegram Bot channel |
| `src/channels/zalo/zalo-bot-api.ts` | Zalo Bot API client |
| `src/channels/zalo/zalo-bot-channel.ts` | Zalo Bot channel |
| `src/channels/zalo/zalo-channel.ts` | Zalo OA channel (legacy) |

### Usage Example

```typescript
import { ZaloBotChannel, TelegramChannel } from "@/channels";

// Create channels
const telegram = new TelegramChannel();
const zalo = new ZaloBotChannel();

// Check availability
if (await telegram.isAvailable()) {
  await telegram.send("Hello from Telegram!");
}

if (await zalo.isAvailable()) {
  await zalo.send("Hello from Zalo!");
}
```

---

## Channel Routing

Routing configuration in `~/.endiorbot/channels.json`:

```json
{
  "primary": "telegram",
  "routing": {
    "budget": ["telegram", "zalo-bot"],
    "approval": ["telegram", "zalo-bot"],
    "gate": ["telegram"],
    "status": ["telegram"],
    "error": ["telegram"]
  }
}
```

---

## Troubleshooting

### Telegram

| Issue | Solution |
|-------|----------|
| Bot doesn't respond | Check `TELEGRAM_BOT_TOKEN` is valid |
| getUpdates 404 | Token is invalid or expired |
| Message not delivered | Verify `TELEGRAM_CHAT_ID` is correct |

### Zalo Bot

| Issue | Solution |
|-------|----------|
| getMe fails | Check token format (`botId:secret`) |
| getUpdates timeout | BASIC accounts - use webhook or get Chat ID from dashboard |
| sendMessage "chat_id is invalid" | Chat ID must be hex string from Bot Manager |
| 408 Request timeout | Normal polling timeout - no new messages |
| Token expired | Regenerate token from Bot Manager |

---

## Security

### Input Sanitization

All incoming messages are sanitized via `InputSanitizer`:
- HTML entities escaped
- Script tags removed
- SQL injection patterns blocked
- Path traversal prevented

### Allowed Users

Channels restrict which users can send commands:
- Telegram: Only configured `TELEGRAM_CHAT_ID`
- Zalo Bot: Only configured `ZALO_BOT_CHAT_ID`

---

*Sprint 51 | EndiorBot v1.1.0 | Updated 2026-02-28*
