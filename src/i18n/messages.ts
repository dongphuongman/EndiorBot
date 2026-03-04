/**
 * Internationalization Messages
 *
 * Message definitions for English and Vietnamese.
 *
 * @module i18n/messages
 * @version 1.0.0
 * @date 2026-03-01
 * @status ACTIVE - Sprint 60
 */

// ============================================================================
// Types
// ============================================================================

export type MessageKey = keyof typeof messages.en;

export type Messages = Record<string, string>;

// ============================================================================
// English Messages
// ============================================================================

const en = {
  // General
  "app.name": "EndiorBot",
  "app.version": "Version {version}",
  "app.description": "SDLC Control Plane + Agent Orchestrator",

  // Commands
  "cmd.help": "Show help",
  "cmd.version": "Show version",
  "cmd.start": "Start project",
  "cmd.switch": "Switch project context",
  "cmd.status": "Show current status",

  // Gates
  "gate.status": "Gate Status",
  "gate.recommend": "Gate Recommendation",
  "gate.confirm": "Gate Confirmation",
  "gate.passed": "Gate {gate} PASSED",
  "gate.failed": "Gate {gate} FAILED",
  "gate.pending": "Gate {gate} PENDING",
  "gate.missing_evidence": "Missing evidence: {evidence}",
  "gate.all_passed": "All gates passed",

  // Evidence
  "evidence.list": "Evidence List",
  "evidence.add": "Add Evidence",
  "evidence.verify": "Verify Evidence",
  "evidence.remove": "Remove Evidence",
  "evidence.added": "Evidence added: {file}",
  "evidence.removed": "Evidence removed: {id}",
  "evidence.verified": "Evidence verified",
  "evidence.not_found": "Evidence not found: {id}",

  // Context
  "context.status": "Context Status",
  "context.inject": "Context Injection",
  "context.search": "Context Search",
  "context.clear": "Context Clear",
  "context.injected": "Context injected successfully",
  "context.cleared": "Context cleared for layer {layer}",
  "context.found": "Found {count} results",

  // Agents
  "agent.invoke": "Invoking agent: {agent}",
  "agent.complete": "Agent {agent} completed",
  "agent.failed": "Agent {agent} failed",
  "agent.handoff": "Handoff to {agent}",
  "agent.waiting": "Waiting for {agent}...",

  // Consult
  "consult.start": "Starting multi-model consultation",
  "consult.querying": "Querying {model}...",
  "consult.complete": "Consultation complete",
  "consult.consensus": "Consensus reached",
  "consult.disagreement": "Models disagree on: {topic}",

  // Performance
  "perf.cache_stats": "Cache Statistics",
  "perf.hit_rate": "Hit rate: {rate}%",
  "perf.size": "Size: {size}",
  "perf.cleared": "Cache cleared",
  "perf.pruned": "Pruned {count} entries",

  // Errors
  "error.unknown": "Unknown error occurred",
  "error.not_found": "Not found: {item}",
  "error.invalid_input": "Invalid input: {reason}",
  "error.permission_denied": "Permission denied",
  "error.network": "Network error: {message}",
  "error.timeout": "Operation timed out",
  "error.rate_limit": "Rate limit exceeded",

  // Success
  "success.operation": "Operation completed successfully",
  "success.saved": "Saved successfully",
  "success.deleted": "Deleted successfully",

  // Warnings
  "warning.no_changes": "No changes detected",
  "warning.deprecated": "This feature is deprecated",
  "warning.experimental": "This feature is experimental",

  // Progress
  "progress.loading": "Loading...",
  "progress.processing": "Processing...",
  "progress.complete": "Complete",
  "progress.eta": "ETA: {time}",

  // Prompts
  "prompt.confirm": "Are you sure? (y/N)",
  "prompt.continue": "Press Enter to continue...",
  "prompt.select": "Select an option:",
  "prompt.input": "Enter value:",

  // Init
  "init.detecting": "Detecting existing SDLC structure...",
  "init.fresh": "Fresh project - creating full scaffold...",
  "init.existing": "Project already initialized",
  "init.partial": "Partial project - completing structure...",
  "init.success": "Project {project} initialized successfully",
  "init.no_changes": "No changes needed",
  "init.invalid_tier": "Invalid tier: {tier}",
  "init.backup_created": "Backup created: {path}",
  "init.scaffolding": "Scaffolding project...",
  "init.complete": "Scaffold complete",
  "init.next_steps": "Next steps:",
  "init.migration_required": "Migration required from {generator}",
  "init.tier_mismatch": "Config tier ({config}) differs from structure ({docs})",
  "init.gitignore_updated": ".gitignore updated with EndiorBot entries",
  "init.unknown_config": "Unknown config format - use --force to overwrite",

  // Migration
  "migration.start": "Starting migration from {source}...",
  "migration.complete": "Migration complete",
  "migration.backup": "Original config backed up to {path}",
  "migration.preserved": "Original config preserved in _original field",

  // Compliance
  "compliance.checking": "Checking SDLC compliance...",
  "compliance.score": "Compliance score: {score}%",
  "compliance.passed": "All compliance checks passed",
  "compliance.failed": "{count} compliance issues found",
  "compliance.missing_file": "Missing required file: {file}",
  "compliance.missing_stage": "Missing stage: {stage}",

  // Compliance Fix
  "compliance.fix.starting": "Starting compliance auto-fix...",
  "compliance.fix.complete": "Compliance fix complete",
  "compliance.fix.dry_run": "[DRY-RUN] Preview mode — no files modified",
  "compliance.fix.no_issues": "No compliance issues to fix",
  "compliance.fix.processing": "Processing stage {stage} with @{agent}...",
  "compliance.fix.score_before": "L2 Score before: {score}%",
  "compliance.fix.score_after": "L2 Score after: {score}%",
  "compliance.fix.issues_fixed": "{count} issues fixed",
  "compliance.fix.issues_failed": "{count} issues failed",

  // OTT Channel (Sprint 76)
  "ott.agents.title": "Available Agents",
  "ott.agents.se4a": "SE4A Executors",
  "ott.agents.se4h": "SE4H Advisors (STANDARD+)",
  "ott.teams.title": "Available Teams",
  "ott.teams.tier": "Tier: {tier}",
  "ott.cmd.gate": "Quality gate status",
  "ott.cmd.compliance": "Compliance score",
  "ott.cmd.fix": "Compliance fix",
  "ott.cmd.fix.starting": "Running compliance fix...",
  "ott.cmd.fix.complete": "Fix complete: {before}% → {after}%",
  "ott.cmd.fix.dry_run": "Dry-run mode (preview only)",
  "ott.cmd.fix.live": "Live mode (files will be modified)",
  "ott.cmd.consult": "Multi-model consultation",
  "ott.cmd.config": "Project configuration",
  "ott.cmd.init": "Init status",
  "ott.cmd.mode": "Invoke mode",
  "ott.mode.read": "Mode set to READ (read-only, safe)",
  "ott.mode.patch": "PATCH mode requested",
  "ott.mode.confirm": "Confirm to proceed with PATCH mode",
  "ott.mode.rejected": "PATCH mode rejected",
  "ott.webhook.enabled": "Webhook enabled at {url}",
  "ott.webhook.disabled": "Webhook disabled, polling resumed",
  "ott.webhook.error": "Webhook error: {message}",
  "ott.webhook.status.active": "Webhook: ACTIVE",
  "ott.webhook.status.inactive": "Webhook: INACTIVE (polling)",
} as const;

// ============================================================================
// Vietnamese Messages
// ============================================================================

const vi = {
  // General
  "app.name": "EndiorBot",
  "app.version": "Phiên bản {version}",
  "app.description": "SDLC Control Plane + Agent Orchestrator",

  // Commands
  "cmd.help": "Hiển thị trợ giúp",
  "cmd.version": "Hiển thị phiên bản",
  "cmd.start": "Bắt đầu dự án",
  "cmd.switch": "Chuyển ngữ cảnh dự án",
  "cmd.status": "Hiển thị trạng thái hiện tại",

  // Gates
  "gate.status": "Trạng Thái Gate",
  "gate.recommend": "Đề Xuất Gate",
  "gate.confirm": "Xác Nhận Gate",
  "gate.passed": "Gate {gate} ĐẠT",
  "gate.failed": "Gate {gate} KHÔNG ĐẠT",
  "gate.pending": "Gate {gate} ĐANG CHỜ",
  "gate.missing_evidence": "Thiếu bằng chứng: {evidence}",
  "gate.all_passed": "Tất cả gates đã đạt",

  // Evidence
  "evidence.list": "Danh Sách Bằng Chứng",
  "evidence.add": "Thêm Bằng Chứng",
  "evidence.verify": "Xác Minh Bằng Chứng",
  "evidence.remove": "Xóa Bằng Chứng",
  "evidence.added": "Đã thêm bằng chứng: {file}",
  "evidence.removed": "Đã xóa bằng chứng: {id}",
  "evidence.verified": "Bằng chứng đã được xác minh",
  "evidence.not_found": "Không tìm thấy bằng chứng: {id}",

  // Context
  "context.status": "Trạng Thái Ngữ Cảnh",
  "context.inject": "Tiêm Ngữ Cảnh",
  "context.search": "Tìm Kiếm Ngữ Cảnh",
  "context.clear": "Xóa Ngữ Cảnh",
  "context.injected": "Đã tiêm ngữ cảnh thành công",
  "context.cleared": "Đã xóa ngữ cảnh cho layer {layer}",
  "context.found": "Tìm thấy {count} kết quả",

  // Agents
  "agent.invoke": "Đang gọi agent: {agent}",
  "agent.complete": "Agent {agent} hoàn thành",
  "agent.failed": "Agent {agent} thất bại",
  "agent.handoff": "Bàn giao cho {agent}",
  "agent.waiting": "Đang chờ {agent}...",

  // Consult
  "consult.start": "Bắt đầu tư vấn đa model",
  "consult.querying": "Đang hỏi {model}...",
  "consult.complete": "Tư vấn hoàn tất",
  "consult.consensus": "Đạt được đồng thuận",
  "consult.disagreement": "Các model không đồng ý về: {topic}",

  // Performance
  "perf.cache_stats": "Thống Kê Cache",
  "perf.hit_rate": "Tỷ lệ hit: {rate}%",
  "perf.size": "Kích thước: {size}",
  "perf.cleared": "Đã xóa cache",
  "perf.pruned": "Đã dọn {count} mục",

  // Errors
  "error.unknown": "Đã xảy ra lỗi không xác định",
  "error.not_found": "Không tìm thấy: {item}",
  "error.invalid_input": "Đầu vào không hợp lệ: {reason}",
  "error.permission_denied": "Quyền truy cập bị từ chối",
  "error.network": "Lỗi mạng: {message}",
  "error.timeout": "Thao tác hết thời gian",
  "error.rate_limit": "Vượt quá giới hạn tần suất",

  // Success
  "success.operation": "Thao tác hoàn tất thành công",
  "success.saved": "Đã lưu thành công",
  "success.deleted": "Đã xóa thành công",

  // Warnings
  "warning.no_changes": "Không phát hiện thay đổi",
  "warning.deprecated": "Tính năng này đã lỗi thời",
  "warning.experimental": "Tính năng này đang thử nghiệm",

  // Progress
  "progress.loading": "Đang tải...",
  "progress.processing": "Đang xử lý...",
  "progress.complete": "Hoàn thành",
  "progress.eta": "Còn lại: {time}",

  // Prompts
  "prompt.confirm": "Bạn có chắc không? (c/K)",
  "prompt.continue": "Nhấn Enter để tiếp tục...",
  "prompt.select": "Chọn một tùy chọn:",
  "prompt.input": "Nhập giá trị:",

  // Init
  "init.detecting": "Đang phát hiện cấu trúc SDLC...",
  "init.fresh": "Dự án mới - tạo scaffold đầy đủ...",
  "init.existing": "Dự án đã được khởi tạo",
  "init.partial": "Dự án chưa hoàn chỉnh - đang hoàn thiện...",
  "init.success": "Dự án {project} đã được khởi tạo thành công",
  "init.no_changes": "Không cần thay đổi",
  "init.invalid_tier": "Tier không hợp lệ: {tier}",
  "init.backup_created": "Đã tạo backup: {path}",
  "init.scaffolding": "Đang tạo scaffold...",
  "init.complete": "Hoàn thành scaffold",
  "init.next_steps": "Bước tiếp theo:",
  "init.migration_required": "Cần di chuyển từ {generator}",
  "init.tier_mismatch": "Tier cấu hình ({config}) khác với cấu trúc ({docs})",
  "init.gitignore_updated": "Đã cập nhật .gitignore với các mục EndiorBot",
  "init.unknown_config": "Định dạng cấu hình không xác định - dùng --force để ghi đè",

  // Migration
  "migration.start": "Đang bắt đầu di chuyển từ {source}...",
  "migration.complete": "Hoàn tất di chuyển",
  "migration.backup": "Cấu hình gốc đã được sao lưu tại {path}",
  "migration.preserved": "Cấu hình gốc được giữ lại trong trường _original",

  // Compliance
  "compliance.checking": "Đang kiểm tra tuân thủ SDLC...",
  "compliance.score": "Điểm tuân thủ: {score}%",
  "compliance.passed": "Tất cả kiểm tra tuân thủ đã đạt",
  "compliance.failed": "Phát hiện {count} vấn đề tuân thủ",
  "compliance.missing_file": "Thiếu tập tin bắt buộc: {file}",
  "compliance.missing_stage": "Thiếu giai đoạn: {stage}",

  // Compliance Fix
  "compliance.fix.starting": "Đang bắt đầu tự động sửa tuân thủ...",
  "compliance.fix.complete": "Hoàn tất sửa tuân thủ",
  "compliance.fix.dry_run": "[DRY-RUN] Chế độ xem trước — không sửa đổi tập tin",
  "compliance.fix.no_issues": "Không có vấn đề tuân thủ cần sửa",
  "compliance.fix.processing": "Đang xử lý giai đoạn {stage} với @{agent}...",
  "compliance.fix.score_before": "Điểm L2 trước: {score}%",
  "compliance.fix.score_after": "Điểm L2 sau: {score}%",
  "compliance.fix.issues_fixed": "Đã sửa {count} vấn đề",
  "compliance.fix.issues_failed": "{count} vấn đề không sửa được",

  // OTT Channel (Sprint 76)
  "ott.agents.title": "Danh sách Agent",
  "ott.agents.se4a": "SE4A Thực thi",
  "ott.agents.se4h": "SE4H Cố vấn (STANDARD+)",
  "ott.teams.title": "Danh sách Team",
  "ott.teams.tier": "Tier: {tier}",
  "ott.cmd.gate": "Trạng thái cổng chất lượng",
  "ott.cmd.compliance": "Điểm tuân thủ",
  "ott.cmd.fix": "Sửa tuân thủ",
  "ott.cmd.fix.starting": "Đang chạy sửa tuân thủ...",
  "ott.cmd.fix.complete": "Hoàn tất sửa: {before}% → {after}%",
  "ott.cmd.fix.dry_run": "Chế độ xem trước (không sửa đổi)",
  "ott.cmd.fix.live": "Chế độ trực tiếp (sẽ sửa đổi tập tin)",
  "ott.cmd.consult": "Tham vấn đa mô hình",
  "ott.cmd.config": "Cấu hình dự án",
  "ott.cmd.init": "Trạng thái khởi tạo",
  "ott.cmd.mode": "Chế độ gọi",
  "ott.mode.read": "Chế độ READ (chỉ đọc, an toàn)",
  "ott.mode.patch": "Yêu cầu chế độ PATCH",
  "ott.mode.confirm": "Xác nhận để tiếp tục với chế độ PATCH",
  "ott.mode.rejected": "Chế độ PATCH bị từ chối",
  "ott.webhook.enabled": "Webhook đã bật tại {url}",
  "ott.webhook.disabled": "Webhook đã tắt, tiếp tục polling",
  "ott.webhook.error": "Lỗi webhook: {message}",
  "ott.webhook.status.active": "Webhook: ĐANG HOẠT ĐỘNG",
  "ott.webhook.status.inactive": "Webhook: KHÔNG HOẠT ĐỘNG (polling)",
} as const;

// ============================================================================
// Exports
// ============================================================================

export const messages = {
  en,
  vi,
} as const;
