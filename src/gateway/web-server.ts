/**
 * Gateway Web Server
 *
 * HTTP server with WebSocket upgrade for web-based chat interface.
 * HTTP + WebSocket web channel for browser-based chat.
 *
 * @module gateway/web-server
 * @version 1.0.0
 * @date 2026-02-28
 * @status ACTIVE - Sprint 51
 */

import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { WebSocketServer, WebSocket, type RawData } from "ws";
import { randomUUID } from "crypto";
import { readFileSync, existsSync } from "fs";
import { homedir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { GatewayConfig, ClientInfo, GatewayEvent } from "./types.js";
import { resolveGatewayConfig } from "./config.js";
import { TriggerRegistry, handleWebhookRequest } from "./webhooks/index.js";
import { envInt, TIMEOUTS } from "../config/timeouts.js";
import { getPreset, setPreset, getEffectivePolicy, readAuditTail } from "../security/exec-approvals/index.js";
import { isFeatureEnabled } from "../config/feature-flags.js";
import type { Preset } from "../security/exec-approvals/types.js";
import {
  type JsonRpcRequest,
  type JsonRpcResponse,
  isJsonRpcRequest,
  createSuccessResponse,
  JSONRPC_VERSION,
} from "./protocol/schema.js";
import {
  parseError,
  invalidRequest,
  methodNotFound,
  internalError,
} from "./protocol/errors.js";
import { createLogger } from "../logging/index.js";
import { VERSION } from "../index.js";
import type { WebhookHandler } from "../channels/ott/webhook-handler.js";

// ============================================================================
// Constants
// ============================================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Try multiple paths for the HTML file
const HTML_PATHS = [
  join(__dirname, "web", "index.html"),
  join(__dirname, "..", "..", "src", "gateway", "web", "index.html"),
  join(process.cwd(), "src", "gateway", "web", "index.html"),
];

// ============================================================================
// Types
// ============================================================================

interface ExtendedWebSocket extends WebSocket {
  clientId: string;
  clientInfo: ClientInfo;
  isAlive: boolean;
}

type MethodHandler = (params: unknown, client: ClientInfo) => Promise<unknown> | unknown;

// ============================================================================
// Web Gateway Server
// ============================================================================

/**
 * WebGatewayServer - HTTP + WebSocket server for web interface.
 */
export class WebGatewayServer {
  private httpServer: ReturnType<typeof createServer> | null = null;
  private wss: WebSocketServer | null = null;
  private clients: Map<string, ExtendedWebSocket> = new Map();
  private methods: Map<string, MethodHandler> = new Map();
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private _config: GatewayConfig;
  private _isRunning = false;
  private _startedAt: Date | null = null;
  private log = createLogger("web-gateway");
  private htmlContent: string = "";
  private webhookHandler: WebhookHandler | null = null;
  /** C2 programmable webhook trigger registry (Sprint 134) */
  private triggerRegistry = new TriggerRegistry();
  private _healthCollector: (() => Promise<unknown>) | null = null;

  constructor(config?: Partial<GatewayConfig>) {
    this._config = resolveGatewayConfig(config);
    this.loadHtmlContent();
    this.registerBuiltinMethods();
  }

  get isRunning(): boolean {
    return this._isRunning;
  }

  get config(): GatewayConfig {
    return this._config;
  }

  /**
   * Load HTML content from file.
   */
  private loadHtmlContent(): void {
    for (const htmlPath of HTML_PATHS) {
      if (existsSync(htmlPath)) {
        try {
          this.htmlContent = readFileSync(htmlPath, "utf-8");
          this.log.info("Loaded web UI", { path: htmlPath });
          return;
        } catch (err) {
          this.log.warn("Failed to load HTML", { path: htmlPath, error: (err as Error).message });
        }
      }
    }

    // Fallback HTML
    this.htmlContent = `<!DOCTYPE html>
<html><head><title>EndiorBot</title></head>
<body style="background:#0f1117;color:#e4e4e7;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
<div style="text-align:center">
<h1>EndiorBot Gateway</h1>
<p>Web UI not found. Connect via WebSocket at ws://localhost:${this._config.port}</p>
</div>
</body></html>`;
  }

  /**
   * Start the server.
   */
  async start(): Promise<void> {
    if (this._isRunning) {
      throw new Error("Server is already running");
    }

    // Create HTTP server
    this.httpServer = createServer(this.handleHttpRequest.bind(this));

    // Create WebSocket server attached to HTTP server
    this.wss = new WebSocketServer({
      server: this.httpServer,
      path: "/ws",
      maxPayload: this._config.maxMessageSize,
    });

    // Set up WebSocket handlers
    this.wss.on("connection", this.handleConnection.bind(this));
    this.wss.on("error", (err) => this.log.error("WebSocket error", { error: err.message }));

    // Start heartbeat
    this.startHeartbeat();

    // Start listening
    await new Promise<void>((resolve, reject) => {
      this.httpServer?.listen(this._config.port, this._config.host, () => {
        this._isRunning = true;
        this._startedAt = new Date();
        this.log.info("Web Gateway started", {
          url: `http://${this._config.host}:${this._config.port}`,
          wsUrl: `ws://${this._config.host}:${this._config.port}/ws`,
        });
        resolve();
      });

      this.httpServer?.on("error", reject);
    });
  }

  /**
   * Stop the server.
   */
  async stop(): Promise<void> {
    if (!this._isRunning) return;

    this.stopHeartbeat();

    // Close all clients
    for (const client of this.clients.values()) {
      client.close(1000, "Server shutting down");
    }
    this.clients.clear();

    // Close servers
    await new Promise<void>((resolve) => {
      this.wss?.close(() => {
        this.httpServer?.close(() => {
          this._isRunning = false;
          this.log.info("Web Gateway stopped");
          resolve();
        });
      });
    });
  }

  // ==========================================================================
  // HTTP Handling
  // ==========================================================================

  /**
   * Set health collector for enhanced /api/health (Sprint 94 D5).
   */
  setHealthCollector(collector: () => Promise<unknown>): void {
    this._healthCollector = collector;
  }

  /**
   * Get connection stats for health reporting (Sprint 94 D5).
   */
  getConnectionStats(): { totalConnections: number; activeConnections: number; messagesReceived: number; messagesSent: number } {
    return {
      totalConnections: this.clients.size,
      activeConnections: this.clients.size,
      messagesReceived: 0,
      messagesSent: 0,
    };
  }

  /**
   * Get number of registered methods (Sprint 94 D5).
   */
  getMethodCount(): number {
    return this.methods.size;
  }

  /**
   * Set webhook handler for OTT channels (Sprint 76).
   * Routes POST /webhook/* to the handler.
   */
  setWebhookHandler(handler: WebhookHandler): void {
    this.webhookHandler = handler;
    this.log.info("Webhook handler attached");
  }

  /** Get the C2 trigger registry for programmatic webhook registration (Sprint 134). */
  getTriggerRegistry(): TriggerRegistry {
    return this.triggerRegistry;
  }

  private handleHttpRequest(req: IncomingMessage, res: ServerResponse): void {
    const url = req.url ?? "/";

    // CTO C2 FIX: Handle webhook routes BEFORE other routes
    // Webhook endpoints are server-to-server — skip wildcard CORS (CTO W4)
    if (url.startsWith("/webhook/")) {
      if (this.webhookHandler) {
        void this.webhookHandler.handleRequest(req, res).catch((err) => {
          this.log.error("Webhook handler error", { error: (err as Error).message });
          if (!res.headersSent) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Internal Server Error" }));
          }
        });
      } else {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Webhook handler not configured" }));
      }
      return;
    }

    // CORS headers (for non-webhook routes only)
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // C2 Webhook Ingress — POST /api/webhooks/:triggerId (Sprint 134)
    const webhookMatch = url.match(/^\/api\/webhooks\/([a-zA-Z0-9_-]+)$/);
    if (webhookMatch && req.method === "POST") {
      const triggerId = webhookMatch[1]!;
      const bodyChunks: Buffer[] = [];
      let bodySize = 0;
      const maxBody = envInt("ENDIORBOT_WEBHOOK_MAX_BODY_SIZE", 1024 * 1024);

      req.on("data", (chunk: Buffer) => {
        bodySize += chunk.length;
        if (bodySize <= maxBody) bodyChunks.push(chunk);
      });

      req.on("end", () => {
        if (bodySize > maxBody) {
          res.writeHead(413, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Payload too large" }));
          return;
        }
        let body: unknown;
        try {
          body = JSON.parse(Buffer.concat(bodyChunks).toString("utf-8"));
        } catch {
          body = Buffer.concat(bodyChunks).toString("utf-8");
        }
        const headers: Record<string, string | string[] | undefined> = {};
        for (const [k, v] of Object.entries(req.headers)) {
          headers[k] = v;
        }
        const clientIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim()
          ?? req.socket.remoteAddress ?? "unknown";

        handleWebhookRequest(
          { registry: this.triggerRegistry },
          triggerId,
          body,
          headers,
          clientIp,
        ).then(result => {
          res.writeHead(result.status, { "Content-Type": "application/json" });
          res.end(JSON.stringify(result.body));
        }).catch(err => {
          this.log.error("C2 webhook error", { error: (err as Error).message });
          if (!res.headersSent) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Internal Server Error" }));
          }
        });
      });
      return;
    }

    // ── Sprint 135 T4: Web API endpoints ──

    // CPO fix: enforce token auth on GET endpoints when bound to non-localhost
    const isLocalhost = this._config.host === "127.0.0.1" || this._config.host === "localhost";
    if (!isLocalhost && (url.startsWith("/api/config") || url.startsWith("/api/audit"))) {
      const token = this._config.authToken ?? process.env["ENDIORBOT_GATEWAY_TOKEN"];
      const provided = (req.headers.authorization ?? "").replace("Bearer ", "");
      if (!token || provided !== token) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Unauthorized — GATEWAY_TOKEN required for non-localhost access" }));
        return;
      }
    }

    // GET /api/config — system configuration summary
    if (url === "/api/config" && req.method === "GET") {
      const config = {
        execPolicy: { preset: getPreset(), policy: getEffectivePolicy() },
        activeMemory: { enabled: isFeatureEnabled("ACTIVE_MEMORY_ENABLED") },
        autoHandoff: { enabled: process.env["ENDIORBOT_AUTO_HANDOFF"] === "true" },
        timeouts: TIMEOUTS,
        webhooks: { triggers: this.triggerRegistry.list() },
      };
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(config, null, 2));
      return;
    }

    // GET /api/audit/:type?limit=N — audit log viewer
    const auditMatch = url.match(/^\/api\/audit\/([a-z-]+)/);
    if (auditMatch && req.method === "GET") {
      const type = auditMatch[1]!;
      const limitParam = new URL(url, `http://${req.headers.host ?? "localhost"}`).searchParams.get("limit");
      const limit = Math.min(parseInt(limitParam ?? "10", 10) || 10, 100);

      if (type === "exec-policy") {
        const entries = readAuditTail(limit);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ type, entries, count: entries.length }));
        return;
      }

      // ssrf + webhooks: read JSONL files
      const logFiles: Record<string, string> = {
        ssrf: "ssrf-blocks.log",
        webhooks: "webhooks.log",
      };
      const logFile = logFiles[type];
      if (logFile) {
        const logPath = join(homedir(), ".endiorbot", "audit-logs", logFile);
        let entries: unknown[] = [];
        if (existsSync(logPath)) {
          const lines = readFileSync(logPath, "utf-8").trim().split("\n").filter(l => l.length > 0);
          entries = lines.slice(-limit).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean).reverse();
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ type, entries, count: entries.length }));
        return;
      }

      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: `Unknown audit type: ${type}. Valid: exec-policy, ssrf, webhooks` }));
      return;
    }

    // POST /api/config/exec-policy/preset — change preset (auth required)
    if (url === "/api/config/exec-policy/preset" && req.method === "POST") {
      // Auth: require GATEWAY_TOKEN
      const token = this._config.authToken ?? process.env["ENDIORBOT_GATEWAY_TOKEN"];
      const provided = (req.headers.authorization ?? "").replace("Bearer ", "");
      if (!token || provided !== token) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Unauthorized — set ENDIORBOT_GATEWAY_TOKEN" }));
        return;
      }
      const bodyChunks: Buffer[] = [];
      req.on("data", (c: Buffer) => bodyChunks.push(c));
      req.on("end", () => {
        try {
          const body = JSON.parse(Buffer.concat(bodyChunks).toString("utf-8")) as { preset?: string };
          const validPresets = new Set(["open", "balanced", "strict"]);
          if (!body.preset || !validPresets.has(body.preset)) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: `Invalid preset. Valid: open, balanced, strict` }));
            return;
          }
          const old = getPreset();
          setPreset(body.preset as Preset);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, old, new: body.preset }));
        } catch {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Invalid JSON body" }));
        }
      });
      return;
    }

    // POST /api/config/active-memory — toggle (auth required)
    if (url === "/api/config/active-memory" && req.method === "POST") {
      const token = this._config.authToken ?? process.env["ENDIORBOT_GATEWAY_TOKEN"];
      const provided = (req.headers.authorization ?? "").replace("Bearer ", "");
      if (!token || provided !== token) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Unauthorized" }));
        return;
      }
      const bodyChunks: Buffer[] = [];
      req.on("data", (c: Buffer) => bodyChunks.push(c));
      req.on("end", () => {
        try {
          const body = JSON.parse(Buffer.concat(bodyChunks).toString("utf-8")) as { enabled?: boolean };
          if (typeof body.enabled !== "boolean") {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: `Body must have { "enabled": true|false }` }));
            return;
          }
          process.env["ENDIORBOT_FF_ACTIVE_MEMORY_ENABLED"] = body.enabled ? "true" : "false";
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, activeMemory: body.enabled }));
        } catch {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Invalid JSON body" }));
        }
      });
      return;
    }

    // Route handling
    if (url === "/" || url === "/index.html") {
      this.serveHtml(res);
    } else if (url === "/api/status") {
      this.serveStatus(res);
    } else if (url === "/api/health") {
      this.serveHealth(res);
    } else {
      // For any other path, return upgrade required (WebSocket)
      res.writeHead(426, { "Content-Type": "text/plain" });
      res.end("Upgrade Required - Use WebSocket at /ws");
    }
  }

  private serveHtml(res: ServerResponse): void {
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
    });
    res.end(this.htmlContent);
  }

  private serveStatus(res: ServerResponse): void {
    const status = {
      ok: true,
      activeConnections: this.clients.size,
      uptimeSec: this._startedAt ? Math.floor((Date.now() - this._startedAt.getTime()) / 1000) : 0,
      authEnabled: this._config.authEnabled,
      serverVersion: VERSION,
      // Sprint 135 T8: Active Memory + exec-policy in status
      execPolicy: { preset: getPreset() },
      activeMemory: { enabled: isFeatureEnabled("ACTIVE_MEMORY_ENABLED") },
      autoHandoff: { enabled: process.env["ENDIORBOT_AUTO_HANDOFF"] === "true" },
      webhookTriggers: this.triggerRegistry.size,
    };

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(status));
  }

  private serveHealth(res: ServerResponse): void {
    // Sprint 94 D5: Return enhanced health report if collector is available
    if (this._healthCollector) {
      this._healthCollector()
        .then((report) => {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(report));
        })
        .catch(() => {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ status: "healthy", timestamp: new Date().toISOString() }));
        });
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "healthy", timestamp: new Date().toISOString() }));
  }

  // ==========================================================================
  // WebSocket Handling
  // ==========================================================================

  private handleConnection(ws: WebSocket, req: IncomingMessage): void {
    const extWs = ws as ExtendedWebSocket;
    const clientId = randomUUID();
    const remoteAddress = req.socket.remoteAddress ?? "unknown";

    extWs.clientId = clientId;
    extWs.isAlive = true;
    extWs.clientInfo = {
      id: clientId,
      type: "web",
      remoteAddress,
      connectedAt: new Date(),
      lastActivity: new Date(),
      authenticated: !this._config.authEnabled,
      subscriptions: new Set(),
    };

    this.clients.set(clientId, extWs);
    this.log.info("Client connected", { clientId, remoteAddress, total: this.clients.size });

    // Set up handlers
    ws.on("message", (data) => this.handleMessage(extWs, data));
    ws.on("close", () => this.handleClose(extWs));
    ws.on("error", (err) => this.log.error("Client error", { clientId, error: err.message }));
    ws.on("pong", () => { extWs.isAlive = true; });

    // Send welcome
    this.sendWelcome(extWs);
  }

  private handleMessage(client: ExtendedWebSocket, data: RawData): void {
    client.clientInfo.lastActivity = new Date();

    let message: unknown;
    try {
      message = JSON.parse(data.toString());
    } catch {
      this.sendResponse(client, parseError());
      return;
    }

    if (!isJsonRpcRequest(message)) {
      this.sendResponse(client, invalidRequest(null, "Not a valid JSON-RPC request"));
      return;
    }

    void this.handleRequest(client, message);
  }

  private async handleRequest(client: ExtendedWebSocket, request: JsonRpcRequest): Promise<void> {
    const handler = this.methods.get(request.method);

    if (!handler) {
      this.sendResponse(client, methodNotFound(request.id, request.method));
      return;
    }

    try {
      const result = await handler(request.params, client.clientInfo);
      this.sendResponse(client, createSuccessResponse(result, request.id));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      this.sendResponse(client, internalError(request.id, message));
    }
  }

  private handleClose(client: ExtendedWebSocket): void {
    this.clients.delete(client.clientId);
    this.log.info("Client disconnected", { clientId: client.clientId, total: this.clients.size });
  }

  private sendResponse(client: ExtendedWebSocket, response: JsonRpcResponse): void {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(response));
    }
  }

  private sendWelcome(client: ExtendedWebSocket): void {
    const welcome = {
      jsonrpc: JSONRPC_VERSION,
      method: "welcome",
      params: {
        clientId: client.clientId,
        serverVersion: VERSION,
        authRequired: this._config.authEnabled,
      },
    };
    client.send(JSON.stringify(welcome));
  }

  // ==========================================================================
  // Heartbeat
  // ==========================================================================

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      for (const client of this.clients.values()) {
        if (!client.isAlive) {
          client.terminate();
          this.clients.delete(client.clientId);
          continue;
        }
        client.isAlive = false;
        client.ping();
      }
    }, this._config.pingInterval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  // ==========================================================================
  // Methods
  // ==========================================================================

  registerMethod(method: string, handler: MethodHandler): void {
    this.methods.set(method, handler);
  }

  private registerBuiltinMethods(): void {
    this.registerMethod("system.ping", () => ({ pong: Date.now() }));

    this.registerMethod("system.version", () => ({
      gateway: VERSION,
      endiorbot: VERSION,
      protocol: JSONRPC_VERSION,
    }));

    this.registerMethod("system.stats", () => ({
      activeConnections: this.clients.size,
      uptimeSec: this._startedAt ? Math.floor((Date.now() - this._startedAt.getTime()) / 1000) : 0,
    }));

    // Chat method - echo for now
    this.registerMethod("chat", async (params, client) => {
      const { message } = params as { message: string };

      // Echo back for WebSocket plain text messages (JSON-RPC commands use /ws endpoint)
      return {
        text: `Received: "${message}"\n\nUse @agent or /command for AI interaction. Example: @pm plan the next sprint`,
        clientId: client.id,
      };
    });
  }

  // ==========================================================================
  // Broadcast
  // ==========================================================================

  broadcast(event: GatewayEvent): void {
    const message = JSON.stringify({
      jsonrpc: JSONRPC_VERSION,
      method: "event",
      params: event,
    });

    for (const client of this.clients.values()) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }

  sendTo(clientId: string, data: unknown): boolean {
    const client = this.clients.get(clientId);
    if (!client || client.readyState !== WebSocket.OPEN) {
      return false;
    }
    client.send(JSON.stringify(data));
    return true;
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createWebGatewayServer(config?: Partial<GatewayConfig>): WebGatewayServer {
  return new WebGatewayServer(config);
}
