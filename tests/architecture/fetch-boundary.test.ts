/**
 * Fetch Boundary Architecture Test — Sprint 133 S2
 *
 * Ensures no bare `fetch(` calls exist in src/providers/*.
 * Any new provider that bypasses safeFetch will fail this test.
 *
 * This is the enforcement backstop for the centralized SSRF layer.
 * If this test fails, a provider is bypassing the SSRF guard.
 *
 * @module tests/architecture/fetch-boundary
 * @version 1.0.0
 * @date 2026-04-11
 * @status ACTIVE - Sprint 133 S2
 * @authority Sprint 133 Task 3c + 3e
 */

import { readFileSync } from "fs";
import { globSync } from "glob";
import { join } from "path";
import { describe, expect, it } from "vitest";

// ============================================================================
// Helpers
// ============================================================================

const PROVIDERS_DIR = join(process.cwd(), "src", "providers");

/**
 * Matches bare `fetch(` that is NOT preceded by "safe" (i.e. not `safeFetch(`).
 *
 * Uses a negative lookbehind: (?<!safe) ensures "safeFetch(" is excluded.
 * Also excludes lines that are comments.
 */
const BARE_FETCH_PATTERN = /(?<!safe)fetch\s*\(/;

interface BareFetchOccurrence {
  file: string;
  line: number;
  content: string;
}

function findBareFetchCalls(): BareFetchOccurrence[] {
  const tsFiles = globSync("**/*.ts", {
    cwd: PROVIDERS_DIR,
    ignore: ["**/*.d.ts", "**/__tests__/**"],
    absolute: true,
  });

  const occurrences: BareFetchOccurrence[] = [];

  for (const file of tsFiles) {
    const content = readFileSync(file, "utf-8");
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? "";
      // Skip comment lines
      const trimmed = line.trimStart();
      if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;

      if (BARE_FETCH_PATTERN.test(line)) {
        occurrences.push({
          file: file.replace(process.cwd(), ""),
          line: i + 1,
          content: line.trim(),
        });
      }
    }
  }

  return occurrences;
}

// ============================================================================
// Tests
// ============================================================================

describe("Fetch Boundary — SSRF enforcement", () => {
  it("src/providers/ contains ZERO bare fetch() calls (all replaced with safeFetch)", () => {
    const occurrences = findBareFetchCalls();

    if (occurrences.length > 0) {
      const details = occurrences
        .map((o) => `  ${o.file}:${o.line} — ${o.content}`)
        .join("\n");
      throw new Error(
        `Found ${occurrences.length} bare fetch() call(s) in src/providers/ — ` +
        `these bypass the SSRF guard. Replace with safeFetch():\n${details}`
      );
    }

    expect(occurrences).toHaveLength(0);
  });

  it("safeFetch is imported from security/safe-fetch in each provider file that makes HTTP calls", () => {
    const tsFiles = globSync("**/*.ts", {
      cwd: PROVIDERS_DIR,
      ignore: ["**/*.d.ts", "**/__tests__/**"],
      absolute: true,
    });

    const filesWithFetchCalls: string[] = [];
    const filesWithSafeFetchImport: string[] = [];

    for (const file of tsFiles) {
      const content = readFileSync(file, "utf-8");
      const hasSafeFetchCall = /safeFetch\s*\(/.test(content);
      const hasSafeFetchImport = /from\s+["'].*safe-fetch\.js["']/.test(content);

      if (hasSafeFetchCall) filesWithFetchCalls.push(file);
      if (hasSafeFetchImport) filesWithSafeFetchImport.push(file);
    }

    // Every file that uses safeFetch must also import it
    for (const file of filesWithFetchCalls) {
      if (!filesWithSafeFetchImport.includes(file)) {
        throw new Error(
          `${file.replace(process.cwd(), "")} uses safeFetch() but does not import it from safe-fetch.js`
        );
      }
    }

    // At least 4 provider files should have safeFetch (openai, anthropic, github, gemini)
    expect(filesWithSafeFetchImport.length).toBeGreaterThanOrEqual(4);
  });
});
