/**
 * Shared Command Handlers — Barrel Re-export
 *
 * Channel-agnostic command implementations used by ALL channels (Web, Telegram, Zalo, CLI).
 * This file is a thin barrel maintained for backward compatibility (Sprint 115).
 * Implementation has been split into domain-specific modules under ./handlers/.
 *
 * Sprint 76: 10 OTT commands (/gate, /compliance, /fix, /consult, /agents, /teams, etc.)
 * Sprint 82.5: 6 Bridge commands (/link, /launch, /sessions, /switch, /capture, /kill)
 * Sprint 115: Split into handlers/ subdirectory
 *
 * @module commands/handlers
 * @version 4.0.0
 * @date 2026-03-22
 * @status ACTIVE - Sprint 115 (Barrel re-export)
 * @authority ADR-019 OTT Channel + ADR-024 Notification Bridge + ADR-030 Unified Commands
 */

export * from "./handlers/index.js";
