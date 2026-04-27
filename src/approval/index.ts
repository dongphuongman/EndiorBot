/**
 * Approval — public barrel export
 *
 * @module approval
 */

export {
  approvalQueue,
  createApprovalRequest,
  waitForApproval,
  updateExpiredRequests,
  clearApprovalQueue,
  getApprovalQueue,
} from "./queue.js";

export type { ApprovalRequest, ApprovalStatus, ApprovalType } from "./queue.js";
