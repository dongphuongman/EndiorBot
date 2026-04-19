#!/usr/bin/env node
/**
 * Sprint 137 P2-04: G3 evidence manifest generator.
 *
 * Hashes the Sprint 137 E2E testing artifacts and writes a JSON manifest so
 * gate confirmations can cite a specific snapshot of the spec + tests +
 * triage doc. Run this after any update to the upstream artifacts.
 *
 * Usage:
 *   node docs/05-test/07-E2E-Testing/scripts/make-evidence-manifest.mjs
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const __filename = fileURLToPath(import.meta.url);
const ROOT = resolve(dirname(__filename), "../../../..");
const OUTPUT = resolve(ROOT, "docs/05-test/07-E2E-Testing/evidence/manifest.json");

const ARTIFACTS = [
  // Stage 03 upstream
  "docs/03-integrate/02-API-Specifications/openapi.json",
  "scripts/generate-openapi.ts",
  // Stage 05 local
  "docs/05-test/07-E2E-Testing/README.md",
  "docs/05-test/07-E2E-Testing/owasp-api-1-6.md",
  "docs/05-test/07-E2E-Testing/scripts/smoke-endpoints.mjs",
  "docs/05-test/07-E2E-Testing/scripts/make-evidence-manifest.mjs",
  "tests/e2e/openapi/openapi-contract.test.ts",
  "tests/e2e/openapi/owasp-controls.test.ts",
];

function sha256(path) {
  const buf = readFileSync(path);
  return createHash("sha256").update(buf).digest("hex");
}

const entries = [];
for (const relative of ARTIFACTS) {
  const abs = resolve(ROOT, relative);
  if (!existsSync(abs)) {
    console.error(`[manifest] missing artifact: ${relative}`);
    process.exit(1);
  }
  const st = statSync(abs);
  entries.push({
    path: relative,
    sha256: sha256(abs),
    bytes: st.size,
    mtime: st.mtime.toISOString(),
  });
}

const manifest = {
  sprint: 137,
  gate: "G3",
  generated_at: new Date().toISOString(),
  artifacts: entries,
  note:
    "Stage 03 ↔ Stage 05 traceability for the EndiorBot gateway API surface. " +
    "Upstream spec lives in 03-integrate; contract tests + triage live in 05-test. " +
    "LOCAL-ONLY identity constraint applies (see AGENTS.md → Handoff Boundary).",
};

mkdirSync(dirname(OUTPUT), { recursive: true });
writeFileSync(OUTPUT, JSON.stringify(manifest, null, 2) + "\n", "utf-8");

console.log(`[manifest] wrote ${OUTPUT}`);
console.log(`  ${entries.length} artifacts, sprint ${manifest.sprint}, gate ${manifest.gate}`);
