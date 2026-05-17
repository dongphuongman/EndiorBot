# Manual Test Plan - EndiorBot CLI

> **Historical artifact** — this document reflects the framework version and test count at the time of writing. Current stats: 8,124+ tests, SDLC 6.3.1.

**Date:** 2026-03-01
**Tester:** @dev + @pjm
**Version:** v1.0 (Sprint 64)
**Status:** 🧪 IN PROGRESS

---

## Test Environment

- **OS:** macOS Darwin 25.3.0
- **Node:** v24.11.0
- **Project:** /path/to/endiorbot
- **Git branch:** main
- **Test data:** EndiorBot repository itself

---

## Test Suite 1: Context Search (Sprint 63)

### TC-1.1: Basic codebase search

**Command:**
```bash
./endiorbot.mjs context search "SEARCH_BUDGET" -c
```

**Expected:**
- ✅ Finds SEARCH_BUDGET constant in types.ts
- ✅ Shows file path, line number, content snippet
- ✅ Respects token budget limits
- ✅ Response time < 5s

**Result:** ⏳ PENDING

---

### TC-1.2: Stage-filtered search

**Command:**
```bash
./endiorbot.mjs context search "Sprint 64" -c --stage 04-BUILD
```

**Expected:**
- ✅ Only searches in 04-BUILD stage files
- ✅ Excludes docs/ and other stages
- ✅ Shows relevant source code files

**Result:** ⏳ PENDING

---

### TC-1.3: Role-filtered search

**Command:**
```bash
./endiorbot.mjs context search "test" -c --role reviewer --topK 5
```

**Expected:**
- ✅ Prioritizes test-related files
- ✅ Returns max 5 results (topK)
- ✅ Shows ranking reason

**Result:** ⏳ PENDING

---

### TC-1.4: File type filter

**Command:**
```bash
./endiorbot.mjs context search "interface" -c --type ts --topK 10
```

**Expected:**
- ✅ Only searches .ts files
- ✅ Excludes .tsx, .js, .md
- ✅ Returns max 10 results

**Result:** ⏳ PENDING

---

### TC-1.5: Search with verbose output

**Command:**
```bash
./endiorbot.mjs context search "ResultRanker" -c -v
```

**Expected:**
- ✅ Shows detailed result information
- ✅ Shows token usage
- ✅ Shows ranking scores
- ✅ Shows provider version

**Result:** ⏳ PENDING

---

### TC-1.6: Empty query handling

**Command:**
```bash
./endiorbot.mjs context search "" -c
```

**Expected:**
- ❌ Error message: "Query is required"
- ❌ Exit code 1

**Result:** ⏳ PENDING

---

## Test Suite 2: Multi-Model Consultation

### TC-2.1: Single model (default)

**Command:**
```bash
./endiorbot.mjs consult "What is Context Drift?"
```

**Expected:**
- ✅ Uses default provider (Gemini)
- ✅ Shows response
- ✅ No consultation (single model)

**Result:** ⏳ PENDING

---

### TC-2.2: Full 3-model consultation

**Command:**
```bash
./endiorbot.mjs consult --full "What is dependency injection?"
```

**Expected:**
- ✅ Queries 3 models (Claude, OpenAI, Gemini)
- ✅ Shows agreement level (full/partial/none)
- ✅ Shows alternative views
- ✅ Token usage summary

**Result:** ⏳ PENDING

---

### TC-2.3: Primary provider override

**Command:**
```bash
./endiorbot.mjs consult --primary openai "Explain async/await"
```

**Expected:**
- ✅ Uses OpenAI as primary
- ✅ Gemini as critic (if coding task)
- ✅ Shows provider in response

**Result:** ⏳ PENDING

---

### TC-2.4: Claude Code CLI (OAuth)

**Command:**
```bash
./endiorbot.mjs consult --via-claude-code "What is context drift?"
```

**Expected:**
- ✅ Uses Claude Code CLI (Max 200)
- ✅ No API credits used
- ✅ Response in ~15-30s
- ✅ Shows "Using Max 200 subscription"

**Result:** ✅ PASS (tested earlier)

---

### TC-2.5: Verbose consultation

**Command:**
```bash
./endiorbot.mjs consult --full -v "What is a closure?"
```

**Expected:**
- ✅ Shows detailed responses from each model
- ✅ Shows token usage per model
- ✅ Shows reasoning/thinking

**Result:** ⏳ PENDING

---

## Test Suite 3: Compliance (Sprint 61)

### TC-3.1: Compliance check

**Command:**
```bash
./endiorbot.mjs compliance check
```

**Expected:**
- ✅ Shows file compliance (CLAUDE.md, AGENTS.md, etc.)
- ✅ Shows stage compliance
- ✅ Detailed report with ✓/✗ markers

**Result:** ⏳ PENDING

---

### TC-3.2: Compliance score

**Command:**
```bash
./endiorbot.mjs compliance score
```

**Expected:**
- ✅ Shows compliance percentage
- ✅ Shows "100%" or detailed breakdown
- ✅ Exit code 0 if 100%, else 1

**Result:** ✅ PASS (100% verified earlier)

---

## Test Suite 4: Init Command (Sprint 61)

### TC-4.1: Detect current state

**Command:**
```bash
./endiorbot.mjs init --dry-run
```

**Expected:**
- ✅ Shows current SDLC state
- ✅ Shows tier (STANDARD)
- ✅ No files created (dry-run)

**Result:** ⏳ PENDING

---

### TC-4.2: Help text

**Command:**
```bash
./endiorbot.mjs init --help
```

**Expected:**
- ✅ Shows usage instructions
- ✅ Lists all options
- ✅ Examples provided

**Result:** ⏳ PENDING

---

## Test Suite 5: Other Core Commands

### TC-5.1: Status command

**Command:**
```bash
./endiorbot.mjs status
```

**Expected:**
- ✅ Shows project status
- ✅ Current sprint
- ✅ Gate status
- ✅ Active agents

**Result:** ⏳ PENDING

---

### TC-5.2: Gate status

**Command:**
```bash
./endiorbot.mjs gate status
```

**Expected:**
- ✅ Shows all gates
- ✅ Status (✓/✗)
- ✅ Requirements

**Result:** ⏳ PENDING

---

### TC-5.3: Help command

**Command:**
```bash
./endiorbot.mjs --help
```

**Expected:**
- ✅ Lists all commands
- ✅ Shows version
- ✅ Shows usage

**Result:** ⏳ PENDING

---

## Test Suite 6: Error Handling

### TC-6.1: Invalid command

**Command:**
```bash
./endiorbot.mjs invalid-command
```

**Expected:**
- ❌ Error: "Unknown command"
- ❌ Exit code 1
- ✅ Suggests valid commands

**Result:** ⏳ PENDING

---

### TC-6.2: Missing required argument

**Command:**
```bash
./endiorbot.mjs context search
```

**Expected:**
- ❌ Error: "Missing required argument: query"
- ❌ Exit code 1

**Result:** ⏳ PENDING

---

### TC-6.3: Invalid option value

**Command:**
```bash
./endiorbot.mjs consult --primary invalid-provider "test"
```

**Expected:**
- ❌ Error: "Invalid provider"
- ✅ Lists valid providers

**Result:** ⏳ PENDING

---

## Test Suite 7: Performance

### TC-7.1: Search performance (< 500ms target)

**Command:**
```bash
time ./endiorbot.mjs context search "function" -c --topK 10
```

**Expected:**
- ✅ Response time < 5s (including startup)
- ✅ Search time < 500ms (logged)

**Result:** ⏳ PENDING

---

### TC-7.2: Large result set handling

**Command:**
```bash
./endiorbot.mjs context search "const" -c --topK 100
```

**Expected:**
- ✅ Handles large results gracefully
- ✅ Respects token budget (2500 hard cap)
- ✅ Shows truncation message if needed

**Result:** ⏳ PENDING

---

## Test Suite 8: Integration Tests

### TC-8.1: Search + Consult workflow

**Commands:**
```bash
# 1. Search for relevant code
./endiorbot.mjs context search "authentication" -c --topK 3 > /tmp/auth-context.txt

# 2. Consult with context
./endiorbot.mjs consult "How does authentication work in this codebase?"
```

**Expected:**
- ✅ Search provides relevant context
- ✅ Consult uses context intelligently
- ✅ Response is accurate

**Result:** ⏳ PENDING

---

### TC-8.2: Init → Compliance workflow

**Commands:**
```bash
# 1. Check compliance before init
./endiorbot.mjs compliance score

# 2. Init (if needed)
./endiorbot.mjs init --dry-run

# 3. Check compliance after
./endiorbot.mjs compliance score
```

**Expected:**
- ✅ Compliance maintained at 100%
- ✅ No regressions

**Result:** ⏳ PENDING

---

## Test Execution Log

### Session 1: 2026-03-01 13:30

**Tester:** @dev
**Environment:** macOS, Node v24.11.0

| Test ID | Command | Result | Notes |
|---------|---------|--------|-------|
| TC-2.4 | consult --via-claude-code | ✅ PASS | 19s response time |
| TC-3.2 | compliance score | ✅ PASS | 100% compliance |
| ... | | ⏳ | Continue testing |

---

## Summary Template

**Total Tests:** 25
**Passed:** 2 ✅
**Failed:** 0 ❌
**Pending:** 23 ⏳
**Blocked:** 0 🚫

**Coverage:**
- Context Search: 0/6
- Multi-Model Consultation: 1/5
- Compliance: 1/2
- Init Command: 0/2
- Core Commands: 0/3
- Error Handling: 0/3
- Performance: 0/2
- Integration: 0/2

---

*Manual Test Plan v1.0 | Sprint 64 | SDLC Framework v6.1.1*

---

## Test Suite 10: Kimi Coding API Integration (Sprint 145)

**Authority:** ADR-053 Kimi Coding API Direct Integration
**Date:** 2026-05-07
**Tester:** @tester

### TC-145.1: Provider registration with KIMI_API_KEY

**Prerequisites:**
- `.env` has `KIMI_API_KEY=sk-...` (CEO subscription key)
- `.env` has `MOONSHOT_API_KEY=sk-...` (optional backup)

**Command:**
```bash
pnpm vitest run tests/providers/kimi-coding/
```

**Expected:**
- ✅ 7/7 unit tests pass
- ✅ Provider metadata correct (`id: "kimi-coding"`, `model: "kimi-for-coding"`)
- ✅ Initialization delegates to AnthropicProvider with correct baseUrl

**Result:** ⏳ PENDING

### TC-145.2: Fallback chain verification

**Command:**
```bash
pnpm vitest run tests/agents/router/providers.ts
```

**Expected:**
- ✅ `callCloudFallback` preferredOrder: `["kimi-coding", "kimi-api", "openai"]`
- ✅ `callKimiProvider` tries `kimi-coding` before `kimi-api`
- ✅ Graceful degrade when both keys missing

**Result:** ⏳ PENDING

### TC-145.3: Live integration test (requires real API key)

**Command:**
```bash
# Requires KIMI_API_KEY in environment
node -e "
const { KimiCodingProvider } = require('./src/providers/kimi-coding/index.js');
const p = new KimiCodingProvider();
await p.initialize({ apiKey: process.env.KIMI_API_KEY });
const h = await p.healthCheck();
console.log('Health:', h.status, h.latencyMs + 'ms');
const r = await p.chat({ model: 'kimi-for-coding', messages: [{role:'user',content:'Hello'}] });
console.log('Response:', r.content.slice(0, 100));
"
```

**Expected:**
- ✅ Health check returns `healthy`
- ✅ Chat response returns non-empty content
- ✅ Latency < 8s

**Result:** ⏳ PENDING

### TC-145.4: Non-coding agent quality check (@cpo KPI)

**Agents to test:** `@pm`, `@researcher`, `@cpo`
**Task:** Non-coding task (e.g., "Write a brief strategy memo")
**Metric:**
- Fallback rate to `claude-code` < 15%
- Output quality score ≥ 4.0/5 (rubric: clarity, completeness, no hallucination)

**Expected:**
- ✅ Agent uses `kimi-for-coding` as primary
- ✅ If quality drops, fallback to `claude-code` automatic
- ✅ No error thrown when kimi-coding unavailable

**Result:** ⏳ PENDING (measure over 7-day window)

### TC-145.5: Legacy cleanup verification

**Command:**
```bash
grep -rn "kimi-proxy\|KimiProxy\|KIMI_PROXY\|ENDIORBOT_KIMI_PROXY\|claude-code-proxy" src/ tests/
```

**Expected:**
- ✅ Zero code references (only comments allowed)
- ✅ `src/providers/kimi-proxy/` does not exist
- ✅ `tests/providers/kimi-proxy/` does not exist

**Result:** ⏳ PENDING
