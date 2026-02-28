/**
 * Gateway Web Server
 *
 * HTTP server with WebSocket upgrade for web-based chat interface.
 * Similar to picoclaw/openclaw web channel.
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
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { GatewayConfig, ClientInfo, GatewayEvent } from "./types.js";
import { resolveGatewayConfig } from "./config.js";
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

  private handleHttpRequest(req: IncomingMessage, res: ServerResponse): void {
    const url = req.url ?? "/";

    // CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
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
      serverVersion: "1.0.0",
    };

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(status));
  }

  private serveHealth(res: ServerResponse): void {
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
        serverVersion: "1.0.0",
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
      gateway: "1.0.0",
      endiorbot: "1.0.0",
      protocol: JSONRPC_VERSION,
    }));

    this.registerMethod("system.stats", () => ({
      activeConnections: this.clients.size,
      uptimeSec: this._startedAt ? Math.floor((Date.now() - this._startedAt.getTime()) / 1000) : 0,
    }));

    // Chat method - echo for now
    this.registerMethod("chat", async (params, client) => {
      const { message } = params as { message: string };

      // For now, echo back. In future, this would route to AI providers
      return {
        text: `Received: "${message}"\n\nThis is EndiorBot Gateway. AI chat integration coming soon!`,
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
