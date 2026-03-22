/**
 * Revenue period parser — detects period from natural language or CLI args.
 */

export type RevenuePeriod = "yesterday" | "week" | "month" | string; // string = "range:DD/MM-DD/MM"

const YESTERDAY_RE = /hôm qua|hom qua|yesterday/i;
const WEEK_RE = /tuần|tuan|week/i;
const MONTH_RE = /tháng|thang|month/i;
// "từ 1/3 đến 15/3" or "từ 01/03 đến 15/03"
const RANGE_RE = /từ\s+(\d{1,2}\/\d{1,2}).*đến\s+(\d{1,2}\/\d{1,2})/i;

/** Revenue-related keywords for intent detection */
export const REVENUE_KEYWORDS = [
  "doanh thu", "revenue", "ezcloud", "kupid", "hotel revenue",
  "báo cáo doanh", "bao cao doanh",
];

/** Returns true if the message looks like a revenue query */
export function isRevenueQuery(text: string): boolean {
  const lower = text.toLowerCase();
  return REVENUE_KEYWORDS.some((kw) => lower.includes(kw));
}

/** Parse a period string from natural language message or CLI arg */
export function parsePeriod(text: string): RevenuePeriod {
  if (YESTERDAY_RE.test(text)) return "yesterday";
  if (WEEK_RE.test(text)) return "week";
  if (MONTH_RE.test(text)) return "month";

  const rangeMatch = text.match(RANGE_RE);
  if (rangeMatch) {
    return `range:${rangeMatch[1]}-${rangeMatch[2]}`;
  }

  // Default: yesterday
  return "yesterday";
}

/** Human-readable period label (Vietnamese) */
export function periodLabel(period: RevenuePeriod): string {
  if (period === "yesterday") return "hôm qua";
  if (period === "week") return "tuần này";
  if (period === "month") return "tháng này";
  if (period.startsWith("range:")) return period.replace("range:", "").replace("-", " → ");
  return period;
}
