/**
 * Gateway Store
 *
 * Manages gateway connection state, WebSocket client, and real-time events.
 * Connects to EndiorBot Gateway at ws://127.0.0.1:18790 for JSON-RPC 2.0 communication.
 *
 * @module apps/desktop/src/stores/gateway
 * @version 2.0.0
 * @date 2026-02-24
 */

import { create } from "zustand";
import type { GatewayStatus } from "../types/electron";

// ============================================================================
// Constants
// ============================================================================

const GATEWAY_WS_URL = "ws://127.0.0.1:18790";
const RECONNECT_BASE_DELAY = 1000; // 1 second
const RECONNECT_MAX_DELAY = 30000; // 30 seconds
const RECONNECT_MAX_ATTEMPTS = 10;

// ============================================================================
// Event Types (matching src/gateway/types.ts)
// ============================================================================

export type GatewayEventType =
  | "budget.update"
  | "budget.warning"
  | "approval.pending"
  | "approval.resolved"
  | "session.started"
  | "session.ended"
  | "agent.status"
  | "gate.status"
  | "notification"
  | "chat.chunk"
  | "chat.done"
  | "chat.error";

// ============================================================================
// Event Data Interfaces
// ============================================================================

export interface BudgetUpdateData {
  sessionId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  sessionTotal: number;
  dailyTotal: number;
  monthlyTotal: number;
}

export interface BudgetWarningData {
  type: "session" | "daily" | "monthly";
  percent: number;
  current: number;
  limit: number;
  sessionId?: string;
}

export interface ApprovalPendingData {
  requestId: string;
  sessionId: string;
  toolName: string;
  args: Record<string, unknown>;
  reason: string;
  createdAt: string;
  expiresAt?: string;
}

export interface ApprovalResolvedData {
  requestId: string;
  sessionId: string;
  approved: boolean;
  resolvedBy: string;
  resolvedAt: string;
}

export interface SessionEventData {
  sessionId: string;
  projectId?: string;
  startedAt?: string;
  endedAt?: string;
  reason?: string;
}

export interface AgentStatusData {
  sessionId: string;
  agentId: string;
  status: "idle" | "thinking" | "executing" | "waiting" | "error";
  currentTool?: string;
  progress?: number;
  message?: string;
}

export interface GateStatusData {
  gateId: string;
  featureId: string;
  status: "pending" | "passed" | "failed";
  checklist?: Array<{ item: string; passed: boolean }>;
}

export interface NotificationData {
  id: string;
  type: "info" | "warning" | "error" | "success";
  title: string;
  message: string;
  timestamp: string;
  actions?: Array<{ label: string; action: string }>;
}

// ============================================================================
// Chat Event Data Interfaces
// ============================================================================

export interface ChatChunkData {
  streamId: string;
  delta: string;
  index: number;
}

export interface ChatDoneData {
  streamId: string;
  content: string;
  model: string;
  usage: {
    input: number;
    output: number;
    cost: number;
  };
  finishReason: string;
}

export interface ChatErrorData {
  streamId?: string;
  error: string;
  code: string;
}

// ============================================================================
// JSON-RPC Types
// ============================================================================

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number | string | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: Record<string, unknown>;
}

type JsonRpcMessage = JsonRpcResponse | JsonRpcNotification;

// ============================================================================
// Event Handler Type
// ============================================================================

export type GatewayEventHandler<T = unknown> = (data: T) => void;

// ============================================================================
// Store Types
// ============================================================================

type WebSocketStatus = "disconnected" | "connecting" | "connected" | "reconnecting";

interface GatewayState {
  // IPC-based gateway process status
  status: GatewayStatus["status"];
  message?: string;
  isConnected: boolean;
  lastChecked?: string;

  // WebSocket connection status
  wsStatus: WebSocketStatus;
  wsError: string | null;
  reconnectAttempt: number;

  // Real-time data from events
  budget: {
    sessionTotal: number;
    dailyTotal: number;
    monthlyTotal: number;
    lastUpdate?: string;
  };
  pendingApprovals: ApprovalPendingData[];
  agentStatuses: Map<string, AgentStatusData>;
  notifications: NotificationData[];
}

interface GatewayActions {
  // IPC actions (gateway process control)
  checkStatus: () => Promise<void>;
  start: () => Promise<boolean>;
  stop: () => Promise<boolean>;
  restart: () => Promise<boolean>;

  // WebSocket actions
  connect: () => void;
  disconnect: () => void;
  send: (method: string, params?: Record<string, unknown>) => Promise<unknown>;

  // Event subscription
  on: <T>(event: GatewayEventType, handler: GatewayEventHandler<T>) => () => void;
  off: (event: GatewayEventType, handler: GatewayEventHandler) => void;

  // Notification management
  dismissNotification: (id: string) => void;
  clearNotifications: () => void;

  // Approval actions
  resolveApproval: (requestId: string, approved: boolean) => Promise<boolean>;
}

type GatewayStore = GatewayState & GatewayActions;

// ============================================================================
// Module-level WebSocket State
// ============================================================================

let ws: WebSocket | null = null;
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
let requestId = 0;
const pendingRequests = new Map<
  number | string,
  { resolve: (value: unknown) => void; reject: (error: Error) => void }
>();
const eventHandlers = new Map<GatewayEventType, Set<GatewayEventHandler>>();

// ============================================================================
// Store Implementation
// ============================================================================

export const useGatewayStore = create<GatewayStore>((set, get) => {
  // --------------------------------------------------------------------------
  // WebSocket Helper Functions
  // --------------------------------------------------------------------------

  const scheduleReconnect = () => {
    const { reconnectAttempt, wsStatus } = get();

    if (reconnectAttempt >= RECONNECT_MAX_ATTEMPTS) {
      set({
        wsStatus: "disconnected",
        wsError: `Max reconnect attempts (${RECONNECT_MAX_ATTEMPTS}) reached`,
      });
      return;
    }

    if (wsStatus === "reconnecting") {
      return; // Already scheduled
    }

    // Exponential backoff: 1s, 2s, 4s, 8s, ... up to 30s
    const delay = Math.min(
      RECONNECT_BASE_DELAY * Math.pow(2, reconnectAttempt),
      RECONNECT_MAX_DELAY
    );

    set({ wsStatus: "reconnecting", reconnectAttempt: reconnectAttempt + 1 });

    reconnectTimeout = setTimeout(() => {
      reconnectTimeout = null;
      get().connect();
    }, delay);
  };

  const processEvent = (eventType: string, data: unknown) => {
    const handlers = eventHandlers.get(eventType as GatewayEventType);
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(data);
        } catch (err) {
          console.error(`[Gateway] Event handler error for ${eventType}:`, err);
        }
      });
    }

    // Update store state based on event type
    switch (eventType) {
      case "budget.update": {
        const budget = data as BudgetUpdateData;
        set({
          budget: {
            sessionTotal: budget.sessionTotal,
            dailyTotal: budget.dailyTotal,
            monthlyTotal: budget.monthlyTotal,
            lastUpdate: new Date().toISOString(),
          },
        });
        break;
      }

      case "approval.pending": {
        const approval = data as ApprovalPendingData;
        set((state) => ({
          pendingApprovals: [...state.pendingApprovals, approval],
        }));
        break;
      }

      case "approval.resolved": {
        const resolved = data as ApprovalResolvedData;
        set((state) => ({
          pendingApprovals: state.pendingApprovals.filter(
            (a) => a.requestId !== resolved.requestId
          ),
        }));
        break;
      }

      case "agent.status": {
        const agent = data as AgentStatusData;
        set((state) => {
          const newMap = new Map(state.agentStatuses);
          newMap.set(agent.agentId, agent);
          return { agentStatuses: newMap };
        });
        break;
      }

      case "notification": {
        const notification = data as NotificationData;
        set((state) => ({
          notifications: [notification, ...state.notifications].slice(0, 50), // Keep last 50
        }));
        break;
      }
    }
  };

  const handleMessage = (event: MessageEvent) => {
    try {
      const message = JSON.parse(event.data as string) as JsonRpcMessage;

      // Handle response to our request
      if ("id" in message && message.id !== null) {
        const pending = pendingRequests.get(message.id);
        if (pending) {
          pendingRequests.delete(message.id);
          if ("error" in message && message.error) {
            pending.reject(new Error(message.error.message));
          } else {
            pending.resolve(message.result);
          }
        }
        return;
      }

      // Handle notification (event from server)
      if ("method" in message) {
        const eventType = message.method;
        const data = message.params;
        processEvent(eventType, data);
      }
    } catch (err) {
      console.error("[Gateway] Failed to parse message:", err);
    }
  };

  const connectWebSocket = () => {
    if (ws?.readyState === WebSocket.OPEN || ws?.readyState === WebSocket.CONNECTING) {
      return;
    }

    set({ wsStatus: "connecting", wsError: null });

    try {
      ws = new WebSocket(GATEWAY_WS_URL);

      ws.onopen = () => {
        set({ wsStatus: "connected", reconnectAttempt: 0, wsError: null });

        // Subscribe to all events
        get().send("subscribe", { events: ["*"] }).catch((err) => {
          console.error("[Gateway] Failed to subscribe:", err);
        });
      };

      ws.onmessage = handleMessage;

      ws.onerror = (error) => {
        console.error("[Gateway] WebSocket error:", error);
        set({ wsError: "WebSocket connection error" });
      };

      ws.onclose = (event) => {
        ws = null;
        const wasConnected = get().wsStatus === "connected";

        if (event.wasClean) {
          set({ wsStatus: "disconnected" });
        } else if (wasConnected || get().reconnectAttempt < RECONNECT_MAX_ATTEMPTS) {
          // Connection lost unexpectedly, try to reconnect
          scheduleReconnect();
        } else {
          set({ wsStatus: "disconnected", wsError: "Connection closed" });
        }
      };
    } catch (err) {
      set({
        wsStatus: "disconnected",
        wsError: err instanceof Error ? err.message : "Failed to connect",
      });
      scheduleReconnect();
    }
  };

  // --------------------------------------------------------------------------
  // Store Definition
  // --------------------------------------------------------------------------

  return {
    // Initial State
    status: "stopped",
    isConnected: false,
    wsStatus: "disconnected",
    wsError: null,
    reconnectAttempt: 0,
    budget: {
      sessionTotal: 0,
      dailyTotal: 0,
      monthlyTotal: 0,
    },
    pendingApprovals: [],
    agentStatuses: new Map(),
    notifications: [],

    // IPC Actions (Gateway Process Control)
    checkStatus: async () => {
      try {
        const result = await window.electron.ipcRenderer.invoke<GatewayStatus>(
          "gateway:status"
        );
        set({
          status: result.status,
          isConnected: result.status === "running",
          lastChecked: new Date().toISOString(),
          ...(result.message !== undefined && { message: result.message }),
        });

        // Auto-connect WebSocket if gateway is running
        if (result.status === "running" && get().wsStatus === "disconnected") {
          get().connect();
        }
      } catch (error) {
        set({
          status: "error",
          message: error instanceof Error ? error.message : "Unknown error",
          isConnected: false,
        });
      }
    },

    start: async () => {
      try {
        set({ status: "starting" });
        const result = await window.electron.ipcRenderer.invoke<{ success: boolean }>(
          "gateway:start"
        );
        if (result.success) {
          set({ status: "running", isConnected: true });
          // Connect WebSocket after gateway starts
          setTimeout(() => get().connect(), 500);
        }
        return result.success;
      } catch (error) {
        set({
          status: "error",
          message: error instanceof Error ? error.message : "Failed to start",
        });
        return false;
      }
    },

    stop: async () => {
      try {
        // Disconnect WebSocket first
        get().disconnect();

        const result = await window.electron.ipcRenderer.invoke<{ success: boolean }>(
          "gateway:stop"
        );
        if (result.success) {
          set({ status: "stopped", isConnected: false });
        }
        return result.success;
      } catch (_error) {
        set({ status: "error", message: "Failed to stop" });
        return false;
      }
    },

    restart: async () => {
      try {
        get().disconnect();
        set({ status: "starting" });

        const result = await window.electron.ipcRenderer.invoke<{ success: boolean }>(
          "gateway:restart"
        );
        if (result.success) {
          set({ status: "running", isConnected: true });
          setTimeout(() => get().connect(), 500);
        }
        return result.success;
      } catch (_error) {
        set({ status: "error", message: "Failed to restart" });
        return false;
      }
    },

    // WebSocket Actions
    connect: () => {
      connectWebSocket();
    },

    disconnect: () => {
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
      }

      // Reject all in-flight requests immediately on disconnect
      for (const [id, { reject }] of pendingRequests.entries()) {
        reject(new Error("WebSocket disconnected"));
        pendingRequests.delete(id);
      }

      if (ws) {
        ws.onclose = null; // Prevent reconnect on intentional close
        ws.close();
        ws = null;
      }

      set({ wsStatus: "disconnected", reconnectAttempt: 0 });
    },

    send: (method: string, params?: Record<string, unknown>): Promise<unknown> => {
      return new Promise((resolve, reject) => {
        if (!ws || ws.readyState !== WebSocket.OPEN) {
          reject(new Error("WebSocket not connected"));
          return;
        }

        const id = ++requestId;
        const request: JsonRpcRequest = {
          jsonrpc: "2.0",
          id,
          method,
          ...(params !== undefined && { params }),
        };

        pendingRequests.set(id, { resolve, reject });

        // Timeout after 30 seconds
        setTimeout(() => {
          if (pendingRequests.has(id)) {
            pendingRequests.delete(id);
            reject(new Error("Request timeout"));
          }
        }, 30000);

        ws.send(JSON.stringify(request));
      });
    },

    // Event Subscription
    on: <T>(event: GatewayEventType, handler: GatewayEventHandler<T>) => {
      if (!eventHandlers.has(event)) {
        eventHandlers.set(event, new Set());
      }
      eventHandlers.get(event)!.add(handler as GatewayEventHandler);

      // Return unsubscribe function
      return () => {
        eventHandlers.get(event)?.delete(handler as GatewayEventHandler);
      };
    },

    off: (event: GatewayEventType, handler: GatewayEventHandler) => {
      eventHandlers.get(event)?.delete(handler);
    },

    // Notification Management
    dismissNotification: (id: string) => {
      set((state) => ({
        notifications: state.notifications.filter((n) => n.id !== id),
      }));
    },

    clearNotifications: () => {
      set({ notifications: [] });
    },

    // Approval Actions
    resolveApproval: async (requestId: string, approved: boolean): Promise<boolean> => {
      try {
        await get().send("approval.resolve", { requestId, approved });
        return true;
      } catch (err) {
        console.error("[Gateway] Failed to resolve approval:", err);
        return false;
      }
    },
  };
});

// ============================================================================
// Selector Hooks
// ============================================================================

export const useGatewayStatus = () =>
  useGatewayStore((state) => ({
    status: state.status,
    wsStatus: state.wsStatus,
    isConnected: state.isConnected && state.wsStatus === "connected",
  }));

export const useBudget = () => useGatewayStore((state) => state.budget);

export const usePendingApprovals = () =>
  useGatewayStore((state) => state.pendingApprovals);

export const useNotifications = () =>
  useGatewayStore((state) => state.notifications);

export const useAgentStatus = (agentId: string) =>
  useGatewayStore((state) => state.agentStatuses.get(agentId));
