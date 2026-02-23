/**
 * Electron API Type Definitions
 *
 * Type definitions for window.electron exposed by preload script.
 *
 * @module apps/desktop/src/types/electron
 * @version 1.0.0
 * @date 2026-02-23
 */

// ============================================================================
// IPC Types
// ============================================================================

export interface IpcRenderer {
  invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T>;
  /** Returns the wrapped listener to pass to `off` for cleanup. */
  on(channel: string, callback: (...args: unknown[]) => void): ((...args: unknown[]) => void) | undefined;
  once(channel: string, callback: (...args: unknown[]) => void): void;
  /** Pass the wrapped listener returned by `on`, not the original callback. */
  off(channel: string, wrappedListener: (...args: unknown[]) => void): void;
}

// ============================================================================
// API Types
// ============================================================================

export interface GatewayStatus {
  status: "stopped" | "starting" | "running" | "error";
  message?: string;
}

export interface Session {
  id: string;
  name: string;
  status: "active" | "paused" | "completed";
  createdAt: string;
  tokenCount?: number;
  maxTokens?: number;
}

export interface Budget {
  dailyLimit: number;
  dailyUsed: number;
  monthlyLimit: number;
  monthlyUsed: number;
  currency: string;
}

export interface Checkpoint {
  id: string;
  sessionId: string;
  createdAt: string;
  brainDigest: string;
  description?: string;
}

export interface FixStatsSummary {
  totalFixes: number;
  successRate: number;
  byCategory: Record<
    string,
    {
      count: number;
      successRate: number;
    }
  >;
  period: {
    start: string;
    end: string;
  };
}

export interface FixPattern {
  id: string;
  category: string;
  count: number;
  successRate: number;
  avgDurationMs: number;
}

// ============================================================================
// Electron API
// ============================================================================

export interface ElectronAPI {
  ipcRenderer: IpcRenderer;
  openExternal: (url: string) => Promise<void>;
  platform: NodeJS.Platform;
  isDev: boolean;
}

// ============================================================================
// Global Declaration
// ============================================================================

declare global {
  interface Window {
    electron: ElectronAPI;
  }
}

export {};
