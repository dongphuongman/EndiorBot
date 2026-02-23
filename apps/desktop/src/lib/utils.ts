/**
 * Utility Functions
 *
 * @module apps/desktop/src/lib/utils
 * @version 1.0.0
 * @date 2026-02-23
 */

/**
 * Merge class names conditionally.
 * Similar to clsx/classnames but simpler.
 */
export function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(" ");
}

/**
 * Format a date for display.
 */
export function formatDate(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Format a timestamp for display.
 */
export function formatTimestamp(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Format a percentage.
 */
export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(0)}%`;
}

/**
 * Format currency.
 */
export function formatCurrency(amount: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amount);
}
