/**
 * Control Plane Module Exports
 *
 * ActionControlPlane for action governance.
 * Implements propose → approve → execute → audit pattern.
 *
 * @module control-plane
 * @version 1.0.0
 * @date 2026-02-28
 * @status ACTIVE - Sprint 54
 * @authority ADR-012 ActionControlPlane
 */

export {
  ActionControlPlane,
  getActionControlPlane,
  resetActionControlPlane,
  type RiskLevel,
  type ApprovalStatus,
  type ActionProposal,
  type ApprovalDecision,
  type ActionResult,
  type AuditLogEntry,
} from './action-control.js';
