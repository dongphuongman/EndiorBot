/**
 * Gateway WebSocket Server
 *
 * WebSocket server for real-time Desktop ↔ CLI communication.
 * Implements JSON-RPC 2.0 protocol over WebSocket.
 *
 * @module gateway/server
 * @version 1.0.0
 * @date 2026-02-23
 * @status ACTIVE - Sprint 44 Gateway Foundation
 * @authority ADR-010 Gateway Architecture
 * @pillar 3 - Resource Optimization
 * @stage 04 - BUILD
 * @sdlc SDLC Framework 6.1.1
 */

import { WebSocketServer, WebSocket, type RawData } from "ws";
import { randomUUID } from "crypto";
import type {
  GatewayConfig,
  ConnectionStats,
  ClientInfo,
  GatewayEvent,
  IGatewayServer,
} from "./types.js";
import { resolveGatewayConfig, validateGatewayConfig } from "./config.js";
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
  unauthorized,
} from "./protocol/errors.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Extended WebSocket with client info.
 */
interface ExtendedWebSocket extends WebSocket {
  clientId: string;
  clientInfo: ClientInfo;
  isAlive: boolean;
}

/**
 * Method handler function.
 */
type MethodHandler = (
  params: unknown,
  client: ClientInfo
) => Promise<unknown> | unknown;

// ============================================================================
// Gateway Server
// ============================================================================

/**
 * GatewayServer - WebSocket server with JSON-RPC 2.0 protocol.
 *
 * Features:
 * 1. JSON-RPC 2.0 request/response
 * 2. Event broadcasting to subscribed clients
 * 3. Localhost-only or token authentication
 * 4. Ping/pong heartbeat
 */
export class GatewayServer implements IGatewayServer {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, ExtendedWebSocket> = new Map();
  private methods: Map<string, MethodHandler> = new Map();
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private _stats: ConnectionStats;
  private _config: GatewayConfig;
  private _isRunning = false;

  constructor(config?: Partial<GatewayConfig>) {
    this._config = resolveGatewayConfig(config);
    this._stats = {
      totalConnections: 0,
      activeConnections: 0,
      messagesReceived: 0,
      messagesSent: 0,
      startedAt: new Date(),
    };

    // Register built-in methods
    this.registerBuiltinMethods();
  }

  // ==========================================================================
  // Public Interface
  // ==========================================================================

  get config(): GatewayConfig {
    return this._config;
  }

  get stats(): ConnectionStats {
    return {
      ...this._stats,
      activeConnections: this.clients.size,
    };
  }

  get isRunning(): boolean {
    return this._isRunning;
  }

  /**
   * Start the gateway server.
   */
  async start(): Promise<void> {
    if (this._isRunning) {
      throw new Error("Gateway server is already running");
    }

    // Validate config
    const validation = validateGatewayConfig(this._config);
    if (!validation.valid) {
      throw new Error(`Invalid configuration: ${validation.errors.join(", ")}`);
    }

    // Create WebSocket server
    this.wss = new WebSocketServer({
      port: this._config.port,
      host: this._config.host,
      maxPayload: this._config.maxMessageSize,
    });

    // Set up event handlers
    this.wss.on("connection", this.handleConnection.bind(this));
    this.wss.on("error", this.handleServerError.bind(this));

    // Start heartbeat
    this.startHeartbeat();

    // Wait for server to be listening
    await new Promise<void>((resolve, reject) => {
      if (!this.wss) {
        return reject(new Error("WebSocket server not initialized"));
      }

      this.wss.on("listening", () => {
        this._isRunning = true;
        this._stats.startedAt = new Date();
        resolve();
      });

      this.wss.on("error", (err) => {
        reject(err);
      });
    });
  }

  /**
   * Stop the gateway server.
   */
  async stop(): Promise<void> {
    if (!this._isRunning || !this.wss) {
      return;
    }

    // Stop heartbeat
    this.stopHeartbeat();

    // Close all client connections
    for (const client of this.clients.values()) {
      client.close(1000, "Server shutting down");
    }
    this.clients.clear();

    // Close server
    await new Promise<void>((resolve, reject) => {
      this.wss?.close((err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });

    this.wss = null;
    this._isRunning = false;
  }

  /**
   * Broadcast event to all subscribed clients.
   */
  broadcast(event: GatewayEvent): void {
    const message = JSON.stringify({
      jsonrpc: JSONRPC_VERSION,
      method: "event",
      params: event,
    });

    for (const client of this.clients.values()) {
      if (
        client.readyState === WebSocket.OPEN &&
        client.clientInfo.subscriptions.has(event.type)
      ) {
        client.send(message);
        this._stats.messagesSent++;
      }
    }
  }

  /**
   * Send event to specific client.
   */
  sendTo(clientId: string, event: GatewayEvent): boolean {
    const client = this.clients.get(clientId);
    if (!client || client.readyState !== WebSocket.OPEN) {
      return false;
    }

    const message = JSON.stringify({
      jsonrpc: JSONRPC_VERSION,
      method: "event",
      params: event,
    });

    client.send(message);
    this._stats.messagesSent++;
    return true;
  }

  /**
   * Get connected clients.
   */
  getClients(): ClientInfo[] {
    return Array.from(this.clients.values()).map((ws) => ws.clientInfo);
  }

  /**
   * Disconnect a client.
   */
  disconnect(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      client.close(1000, "Disconnected by server");
      this.clients.delete(clientId);
    }
  }

  /**
   * Register a method handler.
   */
  registerMethod(method: string, handler: MethodHandler): void {
    this.methods.set(method, handler);
  }

  // ==========================================================================
  // Connection Handling
  // ==========================================================================

  private handleConnection(ws: WebSocket, request: { socket: { remoteAddress?: string } }): void {
    const extWs = ws as ExtendedWebSocket;
    const clientId = randomUUID();
    const remoteAddress = request.socket.remoteAddress ?? "unknown";

    // Check localhost-only mode
    if (
      !this._config.authEnabled &&
      this._config.host === "127.0.0.1" &&
      !this.isLocalhost(remoteAddress)
    ) {
      ws.close(4001, "Only localhost connections allowed");
      return;
    }

    // Initialize client info
    extWs.clientId = clientId;
    extWs.isAlive = true;
    extWs.clientInfo = {
      id: clientId,
      type: "unknown",
      remoteAddress,
      connectedAt: new Date(),
      lastActivity: new Date(),
      authenticated: !this._config.authEnabled, // Auto-auth if no auth required
      subscriptions: new Set(),
    };

    // Store client
    this.clients.set(clientId, extWs);
    this._stats.totalConnections++;

    // Set up client event handlers
    ws.on("message", (data) => this.handleMessage(extWs, data));
    ws.on("close", () => this.handleClose(extWs));
    ws.on("error", (err) => this.handleClientError(extWs, err));
    ws.on("pong", () => {
      extWs.isAlive = true;
    });

    // Send welcome message
    this.sendWelcome(extWs);
  }

  private handleMessage(client: ExtendedWebSocket, data: RawData): void {
    this._stats.messagesReceived++;
    client.clientInfo.lastActivity = new Date();

    // Parse message
    let message: unknown;
    try {
      message = JSON.parse(data.toString());
    } catch {
      this.sendResponse(client, parseError());
      return;
    }

    // Validate JSON-RPC format
    if (!isJsonRpcRequest(message)) {
      this.sendResponse(client, invalidRequest(null, "Not a valid JSON-RPC request"));
      return;
    }

    // Check authentication
    if (!client.clientInfo.authenticated && message.method !== "auth") {
      this.sendResponse(client, unauthorized(message.id));
      return;
    }

    // Handle request
    void this.handleRequest(client, message);
  }

  private async handleRequest(
    client: ExtendedWebSocket,
    request: JsonRpcRequest
  ): Promise<void> {
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
  }

  private handleClientError(client: ExtendedWebSocket, _error: Error): void {
    // Log error but don't crash
    this.clients.delete(client.clientId);
  }

  private handleServerError(_error: Error): void {
    // Log error but don't crash
  }

  // ==========================================================================
  // Response Handling
  // ==========================================================================

  private sendResponse(client: ExtendedWebSocket, response: JsonRpcResponse): void {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(response));
      this._stats.messagesSent++;
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
    this._stats.messagesSent++;
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
  // Built-in Methods
  // ==========================================================================

  private registerBuiltinMethods(): void {
    // System methods
    this.registerMethod("system.ping", () => ({ pong: Date.now() }));

    this.registerMethod("system.version", () => ({
      gateway: "1.0.0",
      endiorbot: "1.0.0",
      protocol: JSONRPC_VERSION,
    }));

    this.registerMethod("system.stats", () => this.stats);

    // Subscription methods
    this.registerMethod("subscribe", (params, client) => {
      const { events } = params as { events: string[] };
      if (!Array.isArray(events)) {
        throw new Error("events must be an array");
      }

      for (const event of events) {
        client.subscriptions.add(event);
      }

      return { subscribed: Array.from(client.subscriptions) };
    });

    this.registerMethod("unsubscribe", (params, client) => {
      const { events } = params as { events: string[] };
      if (!Array.isArray(events)) {
        throw new Error("events must be an array");
      }

      for (const event of events) {
        client.subscriptions.delete(event);
      }

      return { subscribed: Array.from(client.subscriptions) };
    });

    // Auth method (when auth enabled)
    this.registerMethod("auth", (params, client) => {
      if (!this._config.authEnabled) {
        client.authenticated = true;
        return { authenticated: true };
      }

      const { token } = params as { token?: string };
      if (token === this._config.authToken) {
        client.authenticated = true;
        return { authenticated: true };
      }

      throw new Error("Invalid token");
    });
  }

  // ==========================================================================
  // Utilities
  // ==========================================================================

  private isLocalhost(address: string): boolean {
    return (
      address === "127.0.0.1" ||
      address === "::1" ||
      address === "::ffff:127.0.0.1" ||
      address === "localhost"
    );
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a gateway server instance.
 */
export function createGatewayServer(
  config?: Partial<GatewayConfig>
): GatewayServer {
  return new GatewayServer(config);
}
