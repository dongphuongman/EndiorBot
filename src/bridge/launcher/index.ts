/**
 * Launcher Module — Barrel Exports
 *
 * @module bridge/launcher
 * @version 1.0.0
 * @authority ADR-024 (Sprint 92)
 */

export { LockManager } from "./lock-manager.js";
export type { LockFileContent, LockManagerDeps, AcquireResult } from "./lock-manager.js";

export { ProcessMonitor, MAX_RESTARTS, RESTART_WINDOW_MS, DEFAULT_POLL_INTERVAL_MS } from "./process-monitor.js";
export type { ProcessMonitorDeps, PollResult } from "./process-monitor.js";

export { UnifiedLauncher } from "./unified-launcher.js";
export type { UnifiedLauncherDeps, StartResult, LauncherStatus } from "./unified-launcher.js";
