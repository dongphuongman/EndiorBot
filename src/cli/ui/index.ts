/**
 * CLI UI Module
 *
 * Progress indicators, formatting, and visual elements.
 *
 * @module cli/ui
 * @version 1.0.0
 * @date 2026-03-01
 * @status ACTIVE - Sprint 60
 */

// Progress indicators
export {
  ProgressBar,
  Spinner,
  createSpinner,
  createProgressBar,
  withSpinner,
  withProgress,
  type ProgressBarConfig,
  type SpinnerConfig,
} from "./progress.js";

// Formatting
export {
  fmt,
  formatTable,
  formatBox,
  formatList,
  formatNumberedList,
  formatTree,
  formatDuration,
  formatBytes,
  formatRelativeTime,
  type TableConfig,
  type BoxStyle,
  type TreeNode,
} from "./format.js";
