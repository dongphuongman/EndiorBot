/**
 * CLI Formatting Utilities
 *
 * Consistent formatting for CLI output.
 *
 * @module cli/ui/format
 * @version 1.0.0
 * @date 2026-03-01
 * @status ACTIVE - Sprint 60
 */

// ============================================================================
// Colors (ANSI escape codes)
// ============================================================================

const COLORS = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  gray: "\x1b[90m",
} as const;

/**
 * Check if terminal supports colors.
 */
function supportsColor(): boolean {
  return (
    process.stdout.isTTY &&
    process.env.NO_COLOR === undefined &&
    process.env.TERM !== "dumb"
  );
}

const colorEnabled = supportsColor();

/**
 * Apply color if supported.
 */
function colorize(text: string, color: keyof typeof COLORS): string {
  if (!colorEnabled) return text;
  return `${COLORS[color]}${text}${COLORS.reset}`;
}

// ============================================================================
// Text Formatting
// ============================================================================

export const fmt = {
  bold: (text: string) => colorize(text, "bold"),
  dim: (text: string) => colorize(text, "dim"),
  red: (text: string) => colorize(text, "red"),
  green: (text: string) => colorize(text, "green"),
  yellow: (text: string) => colorize(text, "yellow"),
  blue: (text: string) => colorize(text, "blue"),
  magenta: (text: string) => colorize(text, "magenta"),
  cyan: (text: string) => colorize(text, "cyan"),
  gray: (text: string) => colorize(text, "gray"),

  success: (text: string) => `✅ ${colorize(text, "green")}`,
  error: (text: string) => `❌ ${colorize(text, "red")}`,
  warning: (text: string) => `⚠️ ${colorize(text, "yellow")}`,
  info: (text: string) => `ℹ️ ${colorize(text, "blue")}`,
  debug: (text: string) => colorize(`[debug] ${text}`, "gray"),
};

// ============================================================================
// Table Formatting
// ============================================================================

/**
 * Table configuration.
 */
export interface TableConfig {
  /** Column headers */
  headers: string[];
  /** Rows of data */
  rows: string[][];
  /** Column alignments */
  align?: ("left" | "center" | "right")[];
  /** Column padding */
  padding?: number;
  /** Header separator character */
  separator?: string;
}

/**
 * Format a table.
 */
export function formatTable(config: TableConfig): string {
  const { headers, rows, align = [], padding = 2, separator = "─" } = config;

  // Calculate column widths
  const widths = headers.map((h, i) => {
    const maxRow = Math.max(...rows.map((r) => (r[i] ?? "").length));
    return Math.max(h.length, maxRow);
  });

  // Format header
  const headerLine = headers
    .map((h, i) => padCell(h, widths[i] ?? 0, align[i], padding))
    .join("");

  // Format separator
  const sepLine = widths
    .map((w) => separator.repeat(w + padding * 2))
    .join("");

  // Format rows
  const rowLines = rows.map((row) =>
    row.map((cell, i) => padCell(cell, widths[i] ?? 0, align[i], padding)).join("")
  );

  return [headerLine, sepLine, ...rowLines].join("\n");
}

/**
 * Pad a cell to width with alignment.
 */
function padCell(
  text: string,
  width: number,
  align: "left" | "center" | "right" = "left",
  padding: number
): string {
  const paddingStr = " ".repeat(padding);
  let padded: string;

  switch (align) {
    case "right":
      padded = text.padStart(width);
      break;
    case "center":
      const left = Math.floor((width - text.length) / 2);
      const right = width - text.length - left;
      padded = " ".repeat(left) + text + " ".repeat(right);
      break;
    default:
      padded = text.padEnd(width);
  }

  return paddingStr + padded + paddingStr;
}

// ============================================================================
// Box Formatting
// ============================================================================

/**
 * Box style.
 */
export type BoxStyle = "single" | "double" | "rounded" | "bold";

const BOX_CHARS: Record<BoxStyle, { tl: string; tr: string; bl: string; br: string; h: string; v: string }> = {
  single: { tl: "┌", tr: "┐", bl: "└", br: "┘", h: "─", v: "│" },
  double: { tl: "╔", tr: "╗", bl: "╚", br: "╝", h: "═", v: "║" },
  rounded: { tl: "╭", tr: "╮", bl: "╰", br: "╯", h: "─", v: "│" },
  bold: { tl: "┏", tr: "┓", bl: "┗", br: "┛", h: "━", v: "┃" },
};

/**
 * Format text in a box.
 */
export function formatBox(
  content: string | string[],
  style: BoxStyle = "single",
  padding = 1
): string {
  const lines = Array.isArray(content) ? content : content.split("\n");
  const chars = BOX_CHARS[style];
  const maxWidth = Math.max(...lines.map((l) => l.length));
  const paddingStr = " ".repeat(padding);

  const top = chars.tl + chars.h.repeat(maxWidth + padding * 2) + chars.tr;
  const bottom = chars.bl + chars.h.repeat(maxWidth + padding * 2) + chars.br;

  const middle = lines.map((line) => {
    const padded = line.padEnd(maxWidth);
    return `${chars.v}${paddingStr}${padded}${paddingStr}${chars.v}`;
  });

  return [top, ...middle, bottom].join("\n");
}

// ============================================================================
// List Formatting
// ============================================================================

/**
 * Format a bullet list.
 */
export function formatList(items: string[], bullet = "•", indent = 2): string {
  const indentStr = " ".repeat(indent);
  return items.map((item) => `${indentStr}${bullet} ${item}`).join("\n");
}

/**
 * Format a numbered list.
 */
export function formatNumberedList(items: string[], indent = 2): string {
  const indentStr = " ".repeat(indent);
  return items.map((item, i) => `${indentStr}${i + 1}. ${item}`).join("\n");
}

// ============================================================================
// Tree Formatting
// ============================================================================

/**
 * Tree node.
 */
export interface TreeNode {
  label: string;
  children?: TreeNode[];
}

/**
 * Format a tree structure.
 */
export function formatTree(nodes: TreeNode[], prefix = ""): string {
  const lines: string[] = [];

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]!;
    const isLast = i === nodes.length - 1;
    const connector = isLast ? "└── " : "├── ";
    const childPrefix = isLast ? "    " : "│   ";

    lines.push(`${prefix}${connector}${node.label}`);

    if (node.children && node.children.length > 0) {
      lines.push(formatTree(node.children, prefix + childPrefix));
    }
  }

  return lines.join("\n");
}

// ============================================================================
// Time Formatting
// ============================================================================

/**
 * Format milliseconds to human readable.
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.round((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

/**
 * Format bytes to human readable.
 */
export function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let unitIndex = 0;
  let value = bytes;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }

  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

/**
 * Format a relative time (e.g., "2 hours ago").
 */
export function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days} day${days > 1 ? "s" : ""} ago`;
  if (hours > 0) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? "s" : ""} ago`;
  return `${seconds} second${seconds !== 1 ? "s" : ""} ago`;
}
