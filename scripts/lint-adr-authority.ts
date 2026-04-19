#!/usr/bin/env tsx
/**
 * Sprint 138 P3-02: ADR `authority:` field shape audit.
 *
 * SOUL-pm Ground-Truth Rule 4 ("Versioned-artifact CTO sign-off") requires
 * every ADR to log the CTO message reference in the artifact's `authority:`
 * frontmatter field. Before this sprint the field was a free-text string
 * mixing proposer, countersign grade, trigger, and notes — unparseable for
 * automated countersign audits. This lint defines the structured schema and
 * walks every ADR to classify:
 *
 *   PASS      — structured `authority:` present with required keys
 *   MISSING   — no `authority:` field (and ADR has status that should have one)
 *   STALE     — legacy string-form `authority:` still in place
 *   MALFORMED — object-form but missing required keys
 *
 * Schema (minimum viable):
 *
 *   authority:
 *     proposer: "@pm"              # required, actor handle
 *     countersigners:              # required, array (may be empty)
 *       - actor: "@cto"            # required
 *         date: "2026-04-17"       # required, YYYY-MM-DD
 *         grade: "9.5/10"          # optional
 *         reference: "sprint-135"  # optional
 *     trigger: "..."               # optional
 *     notes: "..."                 # optional
 *
 * Usage:
 *   pnpm tsx scripts/lint-adr-authority.ts          # human-readable report
 *   pnpm tsx scripts/lint-adr-authority.ts --json   # machine-readable
 *   pnpm tsx scripts/lint-adr-authority.ts --strict # exit 1 on any MALFORMED/STALE
 */

import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const ROOT = resolve(dirname(__filename), "..");
const ADR_DIR = resolve(ROOT, "docs/02-design/01-ADRs");

export type AuthorityStatus = "PASS" | "MISSING" | "STALE" | "MALFORMED";

export interface AuthorityReport {
  file: string;
  status: AuthorityStatus;
  reasons: string[];
  hasField: boolean;
  isObject: boolean;
  countersigners: number;
}

/**
 * Extract the `authority:` entry from frontmatter as-string. Returns:
 *   null if no frontmatter / no field
 *   { shape: "string" | "object", raw: string } otherwise
 */
export function extractAuthority(
  fm: string,
): { shape: "string" | "object"; raw: string } | null {
  const lines = fm.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const m = line.match(/^authority:\s*(.*)$/);
    if (!m) continue;
    const rest = m[1]!.trim();
    if (rest.startsWith('"') || rest.startsWith("'") || /^\S/.test(rest)) {
      // Inline value → string form. (A YAML object would start on the next line.)
      if (rest.length > 0) return { shape: "string", raw: rest };
    }
    // Collect subsequent indented lines → object form
    const body: string[] = [];
    for (let j = i + 1; j < lines.length; j++) {
      const next = lines[j]!;
      if (/^\S/.test(next)) break; // dedent — end of block
      body.push(next);
    }
    if (body.length > 0) return { shape: "object", raw: body.join("\n") };
    return rest.length > 0 ? { shape: "string", raw: rest } : null;
  }
  return null;
}

/** Minimal YAML object parser — just what we need for the authority schema. */
export function parseAuthorityObject(body: string): {
  proposer?: string;
  countersigners?: Array<{
    actor?: string;
    date?: string;
    grade?: string;
    reference?: string;
  }>;
  trigger?: string;
  notes?: string;
} {
  const out: {
    proposer?: string;
    countersigners?: Array<{
      actor?: string;
      date?: string;
      grade?: string;
      reference?: string;
    }>;
    trigger?: string;
    notes?: string;
  } = {};
  const lines = body.split("\n");

  let inCountersigners = false;
  let currentEntry: Record<string, string> | null = null;

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    if (line.trim() === "") continue;

    // Top-level keys (single indent, 2 spaces)
    const topKey = line.match(/^  ([a-zA-Z_]+):\s*(.*)$/);
    if (topKey) {
      const [, key, rest] = topKey;
      inCountersigners = false;
      currentEntry = null;
      if (key === "proposer") out.proposer = unquote(rest!);
      else if (key === "trigger") out.trigger = unquote(rest!);
      else if (key === "notes") out.notes = unquote(rest!);
      else if (key === "countersigners") {
        out.countersigners = [];
        inCountersigners = true;
      }
      continue;
    }

    // List entry under countersigners: "    - actor: @cto"
    if (inCountersigners) {
      const listStart = line.match(/^    -\s+([a-zA-Z_]+):\s*(.*)$/);
      if (listStart) {
        currentEntry = { [listStart[1]!]: unquote(listStart[2]!) };
        out.countersigners!.push(currentEntry as never);
        continue;
      }
      const listKey = line.match(/^      ([a-zA-Z_]+):\s*(.*)$/);
      if (listKey && currentEntry) {
        currentEntry[listKey[1]!] = unquote(listKey[2]!);
      }
    }
  }

  return out;
}

function unquote(v: string): string {
  const t = v.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  return t;
}

function readFrontmatter(text: string): string | null {
  if (!text.startsWith("---")) return null;
  const end = text.indexOf("\n---", 3);
  if (end < 0) return null;
  return text.slice(4, end);
}

function classify(report: { hasField: boolean; isObject: boolean; authority?: ReturnType<typeof parseAuthorityObject> }): {
  status: AuthorityStatus;
  reasons: string[];
} {
  const reasons: string[] = [];
  if (!report.hasField) {
    return { status: "MISSING", reasons: ["no `authority:` in frontmatter"] };
  }
  if (!report.isObject) {
    return {
      status: "STALE",
      reasons: ["`authority:` is legacy string form — upgrade to structured object"],
    };
  }
  const a = report.authority ?? {};
  if (!a.proposer) reasons.push("missing `proposer`");
  if (!a.countersigners) reasons.push("missing `countersigners` (use [] if not yet countersigned)");
  if (a.countersigners && a.countersigners.length > 0) {
    for (const [i, cs] of a.countersigners.entries()) {
      if (!cs.actor) reasons.push(`countersigners[${i}] missing \`actor\``);
      if (!cs.date) reasons.push(`countersigners[${i}] missing \`date\``);
      if (cs.date && !/^\d{4}-\d{2}-\d{2}$/.test(cs.date)) {
        reasons.push(`countersigners[${i}].date not YYYY-MM-DD: ${cs.date}`);
      }
    }
  }
  if (reasons.length > 0) return { status: "MALFORMED", reasons };
  return { status: "PASS", reasons: [] };
}

export function lintAdr(filePath: string): AuthorityReport {
  const text = readFileSync(filePath, "utf-8");
  const fm = readFrontmatter(text);
  const base = basename(filePath);
  if (!fm) {
    return {
      file: base,
      status: "MISSING",
      reasons: ["no YAML frontmatter"],
      hasField: false,
      isObject: false,
      countersigners: 0,
    };
  }
  const auth = extractAuthority(fm);
  if (!auth) {
    const { status, reasons } = classify({ hasField: false, isObject: false });
    return { file: base, status, reasons, hasField: false, isObject: false, countersigners: 0 };
  }
  if (auth.shape === "string") {
    const { status, reasons } = classify({ hasField: true, isObject: false });
    return { file: base, status, reasons, hasField: true, isObject: false, countersigners: 0 };
  }
  const parsed = parseAuthorityObject(auth.raw);
  const { status, reasons } = classify({ hasField: true, isObject: true, authority: parsed });
  return {
    file: base,
    status,
    reasons,
    hasField: true,
    isObject: true,
    countersigners: parsed.countersigners?.length ?? 0,
  };
}

export function lintAll(): AuthorityReport[] {
  const files = readdirSync(ADR_DIR)
    .filter((f) => f.startsWith("ADR-") && f.endsWith(".md"))
    .map((f) => resolve(ADR_DIR, f))
    .sort();
  return files.map((f) => lintAdr(f));
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const asJson = args.includes("--json");
  const strict = args.includes("--strict");

  const reports = lintAll();
  const counts = { PASS: 0, MISSING: 0, STALE: 0, MALFORMED: 0 };
  for (const r of reports) counts[r.status] += 1;

  if (asJson) {
    console.log(JSON.stringify({ counts, reports }, null, 2));
  } else {
    console.log(`[lint-adr-authority] ${reports.length} ADR files in ${ADR_DIR}`);
    console.log(`  PASS=${counts.PASS} MISSING=${counts.MISSING} STALE=${counts.STALE} MALFORMED=${counts.MALFORMED}`);
    console.log();
    for (const r of reports) {
      if (r.status === "PASS") continue;
      const icon = r.status === "MISSING" ? "⚪" : r.status === "STALE" ? "🟡" : "🔴";
      console.log(`${icon} ${r.status.padEnd(9)} ${r.file}`);
      for (const reason of r.reasons) console.log(`   └─ ${reason}`);
    }
    console.log();
    console.log(`Policy (SOUL-pm Rule 4): every ADR with a versioned status should`);
    console.log(`have a structured \`authority:\` object. See scripts/lint-adr-authority.ts`);
    console.log(`for the schema.`);
  }

  if (strict && (counts.STALE > 0 || counts.MALFORMED > 0)) {
    process.exit(1);
  }
}
