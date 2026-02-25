# OTT Channels Documentation

**Sprint 46 Days 4-9 | EndiorBot Bidirectional Messaging**

## Overview

EndiorBot supports bidirectional OTT (Over-The-Top) messaging channels for CEO escalation and command processing. Channels implement the `BidirectionalChannel` interface enabling two-way communication.

## Supported Channels

| Channel | Status | Features |
|---------|--------|----------|
| Telegram | Active | Polling, Webhooks, Commands |
| Zalo OA | Active | Webhooks, Commands |

## Zalo OA Setup

### 1. Create Zalo Official Account

1. Go to [Zalo Official Account](https://oa.zalo.me/)
2. Create an Official Account (OA)
3. Note your **OA ID** (numeric string)

### 2. Create Zalo App

1. Go to [Zalo Developers](https://developers.zalo.me/)
2. Create a new application
3. Enable "Official Account API"
4. Note your **App ID** and **Secret Key**
5. Generate an **Access Token** (valid 90 days)

### 3. Configure Environment Variables

```bash
# Required
export ENDIORBOT_ZALO_ACCESS_TOKEN="your-access-token"
export ENDIORBOT_ZALO_USER_ID="ceo-user-id"
export ENDIORBOT_ZALO_OA_ID="your-oa-id"

# Optional
export ENDIORBOT_ZALO_REFRESH_TOKEN="your-refresh-token"
export ENDIORBOT_ZALO_WEBHOOK_SECRET="your-webhook-secret"
```

### 4. Webhook Setup (Optional)

For real-time message handling:

1. In Zalo Developer Console, add webhook URL:
   ```
   https://your-domain.com/webhooks/zalo
   ```
2. Set your `ENDIORBOT_ZALO_WEBHOOK_SECRET`
3. Verify the webhook using Zalo's verification flow

## channels.json Configuration

Channel routing is configured in `~/.endiorbot/channels.json`:

### Schema

```typescript
interface ChannelRoutingConfig {
  primary: string;                        // Fallback channel
  routing: Record<AlertType, string[]>;   // Per-alert routing
}

type AlertType = "budget" | "approval" | "gate" | "status" | "error";
```

### Example Configuration

```json
{
  "primary": "telegram",
  "routing": {
    "budget": ["telegram", "zalo"],
    "approval": ["telegram", "zalo"],
    "gate": ["telegram"],
    "status": ["telegram"],
    "error": ["telegram"]
  }
}
```

### Routing Behavior

- Alerts are sent to all channels in the routing array
- If no routing defined for an alert type, falls back to `primary`
- Channels are tried in order; failures don't block other channels

## Supported Intents

The ConversationHandler parses incoming messages into intents:

| Intent | Trigger | Description |
|--------|---------|-------------|
| `APPROVE` | `/approve <id>` or "approve", "yes", "ok" | Approve pending item |
| `REJECT` | `/reject <id>` or "reject", "no", "deny" | Reject pending item |
| `STATUS` | `/status` or "status", "how is" | Get system status |
| `SHOW_ERROR` | `/error` or "error", "what went wrong" | Show recent errors |
| `TRY_DIFFERENT` | `/try <model>` or "try with", "use instead" | Retry with different model |

### Command Examples

```
/approve apr-123          # Approve item apr-123
/reject apr-456 --reason "Over budget"  # Reject with reason
/status                   # Get current status
/error                    # Show last error
/try gpt-4o               # Retry last task with gpt-4o
```

### NLP Fallback

If no command prefix is detected, NLP patterns are used:

| Pattern | Intent | Confidence |
|---------|--------|------------|
| "approve this", "yes go ahead" | APPROVE | 0.85 |
| "reject that", "no don't do it" | REJECT | 0.85 |
| "how is everything", "what's the status" | STATUS | 0.80 |
| "what error", "what went wrong" | SHOW_ERROR | 0.80 |
| "try with gpt", "use claude instead" | TRY_DIFFERENT | 0.75 |

## Security Notes

### Input Sanitization

**All incoming messages are sanitized before processing.**

The `InputSanitizer` (from `src/security/input-sanitizer.ts`) is active on all incoming channel messages:

```typescript
// Applied automatically in ConversationHandler
const sanitized = sanitize(message.content);
const parsed = parseIntent(sanitized);
```

### Sanitization Rules

- HTML entities are escaped
- Script tags are removed
- SQL injection patterns are blocked
- Path traversal attempts are blocked
- Command injection is prevented

### Allowed User IDs

Channels can restrict which users can send commands:

```typescript
// In channel config
const config: ZaloChannelConfig = {
  accessToken: "...",
  userId: "allowed-ceo-id",  // Only this user can send commands
  // ...
};
```

### Webhook Verification

For webhook-based channels (Zalo):

- Verify `X-Zalo-Signature` header
- Use `webhookSecret` for HMAC validation
- Reject requests with invalid signatures

## GitHub Models Provider Setup

GitHub Models uses a Personal Access Token (PAT) for authentication:

### Option 1: Environment Variable (Recommended)

```bash
export GITHUB_MODELS_PAT="ghp_your_token_here"
# Or use existing GitHub token
export GITHUB_TOKEN="ghp_your_token_here"
```

### Option 2: Keytar Storage

```typescript
import { GitHubModelsProvider } from "@/providers/github";

const provider = new GitHubModelsProvider();
await provider.storePat("ghp_your_token_here");
```

### Verify Setup

```bash
# Check provider availability via config command
endiorbot config env

# Available Providers section shows configured providers
```

## API Reference

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

### Channel Registry

```typescript
import { getChannelRegistry } from "@/channels";

const registry = getChannelRegistry();
registry.register(telegramChannel, 100);  // priority 100
registry.register(zaloChannel, 200);       // priority 200

// Broadcast to all channels
await registry.broadcast(alert);
```

---

*Sprint 46 | EndiorBot v1.0.0*
