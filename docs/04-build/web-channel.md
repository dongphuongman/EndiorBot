# Web Channel Documentation

**Sprint 51 | EndiorBot Gateway Web Interface**

## Overview

The Web Channel provides a browser-based chat UI for the EndiorBot Gateway, similar to the MTS-OpenClaw/picoclaw web channel. It uses a hybrid HTTP + WebSocket server.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    EndiorBot Gateway                            │
│                    localhost:18790                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────┐    ┌─────────────────────────────┐ │
│  │    HTTP Server          │    │    WebSocket Server         │ │
│  │                         │    │                             │ │
│  │  GET /                  │    │  /ws                        │ │
│  │    → Web UI (HTML)      │    │    → JSON-RPC 2.0           │ │
│  │                         │    │    → Bidirectional chat     │ │
│  │  GET /api/status        │    │    → Real-time events       │ │
│  │    → Gateway status     │    │                             │ │
│  │                         │    │                             │ │
│  │  GET /api/health        │    │                             │ │
│  │    → Health check       │    │                             │ │
│  └─────────────────────────┘    └─────────────────────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Components

### 1. WebGatewayServer (`src/gateway/web-server.ts`)

HTTP + WebSocket hybrid server class.

```typescript
class WebGatewayServer {
  // HTTP endpoints
  handleHttpRequest(req, res): void;
  serveHtml(res): void;
  serveStatus(res): void;
  serveHealth(res): void;

  // WebSocket handling
  handleConnection(ws, req): void;
  handleMessage(client, data): void;
  handleRequest(client, request): Promise<void>;

  // Methods registration (JSON-RPC)
  registerMethod(method: string, handler: MethodHandler): void;

  // Broadcasting
  broadcast(event: GatewayEvent): void;
  sendTo(clientId: string, data: unknown): boolean;
}
```

### 2. Web UI (`src/gateway/web/index.html`)

Single-page application with tabs:
- **Chat**: Real-time chat interface
- **Dashboard**: Gateway status, sessions, uptime
- **Channels**: OTT channel status (Telegram, Zalo, Web)

### 3. JSON-RPC 2.0 Protocol

WebSocket messages use JSON-RPC 2.0 format:

```typescript
// Request
{
  "jsonrpc": "2.0",
  "method": "chat",
  "params": { "message": "Hello" },
  "id": 1
}

// Response
{
  "jsonrpc": "2.0",
  "result": { "text": "Response..." },
  "id": 1
}

// Notification (no id)
{
  "jsonrpc": "2.0",
  "method": "welcome",
  "params": { "clientId": "uuid", "serverVersion": "1.0.0" }
}
```

## API Reference

### HTTP Endpoints

| Endpoint | Method | Description | Response |
|----------|--------|-------------|----------|
| `/` | GET | Web UI HTML | text/html |
| `/api/status` | GET | Gateway status | JSON |
| `/api/health` | GET | Health check | JSON |
| `/ws` | WS | WebSocket upgrade | - |

### WebSocket Methods

| Method | Params | Description |
|--------|--------|-------------|
| `system.ping` | - | Heartbeat ping |
| `system.version` | - | Server version info |
| `system.stats` | - | Active connections, uptime |
| `chat` | `{ message: string }` | Send chat message |

### Events (Server → Client)

| Event | Params | Description |
|-------|--------|-------------|
| `welcome` | `{ clientId, serverVersion, authRequired }` | Connection established |
| `event` | `GatewayEvent` | Broadcast events |

## Configuration

```typescript
interface GatewayConfig {
  port: number;              // Default: 18790
  host: string;              // Default: "localhost"
  authEnabled: boolean;      // Default: false (localhost)
  authToken?: string;        // Required if authEnabled
  maxMessageSize: number;    // Default: 1MB
  pingInterval: number;      // Default: 30000ms
}
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ENDIORBOT_GATEWAY_PORT` | `18790` | Server port |
| `ENDIORBOT_GATEWAY_TOKEN` | - | Auth token |
| `ENDIORBOT_GATEWAY_AUTH` | `false` | Enable auth |

## Security

### Localhost-Only by Default

- Binds to `localhost` only (no external access)
- Auth disabled for local development
- CORS headers for browser access

### Authentication (Optional)

When `authEnabled: true`:
1. Client connects to WebSocket
2. Server sends `welcome` with `authRequired: true`
3. Client must call `auth` method with token
4. Server validates token before allowing other methods

### CORS Headers

```http
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type
```

## Client Connection Flow

```
┌─────────────┐                    ┌─────────────┐
│   Browser   │                    │   Gateway   │
└──────┬──────┘                    └──────┬──────┘
       │                                  │
       │  1. GET /                        │
       │─────────────────────────────────>│
       │  HTML (Web UI)                   │
       │<─────────────────────────────────│
       │                                  │
       │  2. WebSocket /ws                │
       │─────────────────────────────────>│
       │  Connected                       │
       │<─────────────────────────────────│
       │                                  │
       │  3. welcome notification         │
       │<─────────────────────────────────│
       │  { clientId, serverVersion }     │
       │                                  │
       │  4. chat request                 │
       │─────────────────────────────────>│
       │  { method: "chat", params: {...}}│
       │                                  │
       │  5. chat response                │
       │<─────────────────────────────────│
       │  { result: { text: "..." }}      │
       │                                  │
```

## Files

| File | Description |
|------|-------------|
| `src/gateway/web-server.ts` | WebGatewayServer class |
| `src/gateway/web/index.html` | Web UI (SPA) |
| `src/gateway/types.ts` | Shared types |
| `src/gateway/config.ts` | Gateway configuration |
| `src/gateway/protocol/schema.ts` | JSON-RPC schema |
| `src/gateway/protocol/errors.ts` | Error responses |

## Usage

### Start Gateway

```bash
# CLI
./endiorbot.mjs gateway run

# Programmatic
import { createWebGatewayServer } from './gateway/web-server';

const server = createWebGatewayServer({ port: 18790 });
await server.start();
```

### Access Web UI

```
http://localhost:18790/
```

### WebSocket Client (JavaScript)

```javascript
const ws = new WebSocket('ws://localhost:18790/ws');

ws.onopen = () => {
  // Send chat message
  ws.send(JSON.stringify({
    jsonrpc: '2.0',
    method: 'chat',
    params: { message: 'Hello!' },
    id: 1
  }));
};

ws.onmessage = (e) => {
  const data = JSON.parse(e.data);
  console.log(data);
};
```

## Integration with AI Providers

Future integration with multi-model orchestrator:

```typescript
// In web-server.ts
this.registerMethod('chat', async (params, client) => {
  const { message } = params as { message: string };

  // Route to AI provider
  const response = await orchestrator.query({
    message,
    clientId: client.id,
    channel: 'web',
  });

  return { text: response.content };
});
```

## Comparison with MTS-OpenClaw

| Feature | MTS-OpenClaw (18789) | EndiorBot (18790) |
|---------|------------------|-------------------|
| Port | 18789 | 18790 |
| Protocol | JSON-RPC 2.0 | JSON-RPC 2.0 |
| Web UI | Yes | Yes |
| Auth | Token-based | Token-based |
| Channels | Telegram, Zalo, etc. | Telegram, Zalo, Web |
| SDLC | No | Yes (gates, CRP, etc.) |

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Upgrade Required" in browser | Normal - navigate to `/` for Web UI |
| WebSocket connection failed | Check port 18790 is not in use |
| Auth error | Verify `ENDIORBOT_GATEWAY_TOKEN` |
| No response to chat | AI integration pending |

---

*Sprint 51 | EndiorBot v1.1.0 | Updated 2026-02-28*
