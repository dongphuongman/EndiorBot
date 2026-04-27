# Dogfooding Test Plan - EndiorBot Self-Development

**Strategy:** Use EndiorBot to develop EndiorBot
**Approach:** Test as you code (incremental coverage)
**Projects:** 2 repos (EndiorBot existing + Dyad new)

---

## Test Scenario A: Existing Project (EndiorBot)

**Goal:** Verify EndiorBot works on mature, complex codebase

### Setup
```bash
cd /path/to/endiorbot
```

**Project Stats:**
- ~6,600 lines TypeScript
- SDLC tier: STANDARD
- Sprint: 64 (active development)
- Compliance: 100%

---

### Test A1: Project Status & Context

**Commands:**
```bash
# 1. Check project status
./endiorbot.mjs status

# 2. Check compliance
./endiorbot.mjs compliance check

# 3. Check current sprint
cat docs/04-build/CURRENT-SPRINT.md
```

**Expected:**
- ✅ Shows Sprint 64 as current
- ✅ Compliance 100%
- ✅ All gates status visible

**Result:** ⏳ PENDING

---

### Test A2: Code Search (Existing Codebase)

**Scenario:** Search for recently added features

**Commands:**
```bash
# 1. Search for ResultRanker (Sprint 64)
./endiorbot.mjs context search "ResultRanker" -c --stage 04-BUILD --topK 5

# 2. Search for SpecSnapshot (Sprint 64)
./endiorbot.mjs context search "SpecSnapshotManager" -c --type ts -v

# 3. Search across all stages
./endiorbot.mjs context search "Sprint 64" -c
```

**Expected:**
- ✅ Finds result-ranker.ts in src/search/
- ✅ Finds spec-snapshot.ts
- ✅ Stage filtering works correctly
- ✅ Response time < 5s

**Result:** ⏳ PENDING

---

### Test A3: Multi-Model Consultation (Development Questions)

**Scenario:** Ask about EndiorBot's own architecture

**Commands:**
```bash
# 1. Simple question
./endiorbot.mjs consult "How does the search budget manager work?"

# 2. Full consultation (3 models)
./endiorbot.mjs consult --full "What's the difference between RgProvider and AstGrepProvider?"

# 3. With primary override
./endiorbot.mjs consult --primary openai "Explain the ResultRanker scoring system"
```

**Expected:**
- ✅ Provides accurate answers based on code
- ✅ Full consultation shows agreement level
- ✅ Response quality high

**Result:** ⏳ PENDING

---

### Test A4: Development Workflow

**Scenario:** Continue Sprint 64 → Sprint 65 transition

**Commands:**
```bash
# 1. Check gate status
./endiorbot.mjs gate status

# 2. Search for Context Anchoring references (Sprint 65)
./endiorbot.mjs context search "Context Anchor" -c --stage 01-PLANNING

# 3. Consult about next sprint
./endiorbot.mjs consult "What should I implement in Sprint 65 for Context Anchoring?"
```

**Expected:**
- ✅ Gates show correct status
- ✅ Finds Sprint 65 planning docs
- ✅ Provides actionable Sprint 65 guidance

**Result:** ⏳ PENDING

---

### Test A5: Self-Improvement Loop

**Scenario:** Use EndiorBot to improve EndiorBot

**Workflow:**
```bash
# 1. Find areas to improve
./endiorbot.mjs context search "TODO\|FIXME\|XXX" -c --topK 10

# 2. Consult about improvement
./endiorbot.mjs consult "How can I optimize the search performance?"

# 3. Verify changes don't break compliance
./endiorbot.mjs compliance check
```

**Expected:**
- ✅ Finds TODOs/FIXMEs
- ✅ Provides improvement suggestions
- ✅ Compliance check passes

**Result:** ⏳ PENDING

---

## Test Scenario B: New Project (Dyad)

**Goal:** Verify EndiorBot works on greenfield project

### Setup
```bash
# 1. Clone or create Dyad repo
cd /path/to/dyad

# 2. Initialize with EndiorBot
/path/to/EndiorBot/endiorbot.mjs init
```

**Project Stats:**
- New repository (0 lines initially)
- SDLC tier: TBD (choose during init)
- Sprint: 0 (not started)
- Compliance: TBD

---

### Test B1: Project Initialization

**Command:**
```bash
./endiorbot.mjs init --tier STANDARD
```

**Expected:**
- ✅ Detects state: "uninitialized"
- ✅ Creates CLAUDE.md, IDENTITY.md, AGENTS.md
- ✅ Creates directory structure
- ✅ Sets up .sdlc-config.json
- ✅ Compliance becomes 100%

**Result:** ⏳ PENDING

---

### Test B2: First Sprint Setup

**Scenario:** Start Sprint 1 for Dyad

**Commands:**
```bash
# 1. Create first sprint plan
./endiorbot.mjs consult "Create Sprint 1 plan for a new project called Dyad"

# 2. Set up project structure
mkdir -p docs/00-foundation docs/01-planning docs/04-build

# 3. Check compliance
./endiorbot.mjs compliance check
```

**Expected:**
- ✅ Provides Sprint 1 plan template
- ✅ Directory structure recognized
- ✅ Compliance improves

**Result:** ⏳ PENDING

---

### Test B3: Development Guidance

**Scenario:** Get guidance on implementing first feature

**Commands:**
```bash
# 1. Ask about architecture
./endiorbot.mjs consult --full "What architecture should I use for Dyad?"

# 2. Search for examples (from EndiorBot)
/path/to/EndiorBot/endiorbot.mjs context search "architecture" -c --stage 02-DESIGN

# 3. Get implementation guidance
./endiorbot.mjs consult "How do I structure my TypeScript project?"
```

**Expected:**
- ✅ Provides architecture recommendations
- ✅ Finds relevant examples from EndiorBot
- ✅ Gives actionable guidance

**Result:** ⏳ PENDING

---

### Test B4: Code-As-You-Go Testing

**Scenario:** Write code → Test immediately

**Workflow:**
```bash
# 1. Write first file: src/index.ts
echo 'console.log("Hello Dyad");' > src/index.ts

# 2. Search for similar patterns
/path/to/EndiorBot/endiorbot.mjs context search "console.log" -c

# 3. Ask for review
./endiorbot.mjs consult "Review this code: $(cat src/index.ts)"

# 4. Check compliance
./endiorbot.mjs compliance check
```

**Expected:**
- ✅ Finds console.log examples
- ✅ Provides code review feedback
- ✅ Compliance tracked

**Result:** ⏳ PENDING

---

### Test B5: Cross-Project Learning

**Scenario:** Learn from EndiorBot while building Dyad

**Commands:**
```bash
# 1. Search EndiorBot for patterns
/path/to/EndiorBot/endiorbot.mjs context search "Provider pattern" -c --stage 04-BUILD

# 2. Consult with context
./endiorbot.mjs consult "Should I use the Provider pattern in Dyad like EndiorBot does?"

# 3. Copy best practices
# (manual: review EndiorBot code, adapt for Dyad)
```

**Expected:**
- ✅ Finds Provider pattern in EndiorBot
- ✅ Provides adaptation guidance
- ✅ Knowledge transfer works

**Result:** ⏳ PENDING

---

## Comparison Tests: A vs B

### Test C1: Search Performance

**Compare:**
```bash
# Large repo (EndiorBot ~6.6k lines)
cd /path/to/EndiorBot
time ./endiorbot.mjs context search "function" -c --topK 10

# Small repo (Dyad ~100 lines)
cd /path/to/dyad
time ./endiorbot.mjs context search "function" -c --topK 10
```

**Expected:**
- ✅ EndiorBot: < 5s (larger codebase)
- ✅ Dyad: < 1s (smaller codebase)
- ✅ Performance scales reasonably

**Result:** ⏳ PENDING

---

### Test C2: Compliance Tracking

**Compare:**
```bash
# Mature project (EndiorBot)
cd /path/to/EndiorBot
./endiorbot.mjs compliance score
# Expected: 100% (mature, well-maintained)

# New project (Dyad)
cd /path/to/dyad
./endiorbot.mjs compliance score
# Expected: ~60-80% (new, incomplete)
```

**Expected:**
- ✅ EndiorBot shows 100%
- ✅ Dyad shows lower % (normal for new project)
- ✅ Both provide actionable feedback

**Result:** ⏳ PENDING

---

### Test C3: Consultation Quality

**Compare:**
```bash
# With context (EndiorBot has code)
cd /path/to/EndiorBot
./endiorbot.mjs consult "How does search work?" -c
# Expected: Uses codebase context

# Without context (Dyad empty)
cd /path/to/dyad
./endiorbot.mjs consult "How does search work?"
# Expected: General knowledge only
```

**Expected:**
- ✅ EndiorBot: Context-aware answers
- ✅ Dyad: General answers (no code yet)
- ✅ Quality difference is clear

**Result:** ⏳ PENDING

---

## Dogfooding Metrics

### Success Criteria

**EndiorBot (Scenario A):**
- [ ] All commands work on own codebase
- [ ] Search finds recent Sprint 64 code
- [ ] Consultation provides accurate architecture info
- [ ] Self-improvement loop works

**Dyad (Scenario B):**
- [ ] Init command sets up new project
- [ ] Provides useful guidance for greenfield
- [ ] Compliance tracking from day 1
- [ ] Cross-project learning works

**Comparison (Scenario C):**
- [ ] Performance scales with codebase size
- [ ] Compliance tracking adapts to maturity
- [ ] Consultation quality reflects context availability

---

## Execution Schedule

### Week 1: Scenario A (EndiorBot)
- Monday: Test A1, A2 (status + search)
- Tuesday: Test A3 (consultation)
- Wednesday: Test A4, A5 (workflow + improvement)

### Week 2: Scenario B (Dyad)
- Monday: Test B1 (init)
- Tuesday: Test B2, B3 (sprint + guidance)
- Wednesday: Test B4, B5 (code-as-you-go + learning)

### Week 3: Comparison (Scenarios C)
- Monday: Test C1, C2 (performance + compliance)
- Tuesday: Test C3 (consultation quality)
- Wednesday: Final report + improvements

---

## Test Results Log

### Session 1: 2026-03-01 14:00

**Tester:** @dev
**Focus:** Scenario A (EndiorBot existing)

| Test ID | Command | Result | Notes |
|---------|---------|--------|-------|
| A1 | status | ⏳ | Not run yet |
| A2 | context search | ⏳ | Blocked: ripgrep not installed |
| A3 | consult | ⏳ | Not run yet |
| ... | | | |

---

## Findings & Improvements

### Finding 1: ripgrep Not Installed

**Issue:** `rg` command aliased to Claude Code, not standalone binary

**Impact:** Search commands fail

**Solution:**
```bash
# Option 1: Install ripgrep
brew install ripgrep

# Option 2: Use Claude Code's ripgrep
# (update RgProvider to use aliased path)
```

**Priority:** P0 (blocks all search tests)

---

### Finding 2: [TBD]

*Document findings as we test*

---

## Next Actions

1. **Install ripgrep** → Unblock search tests
2. **Run Scenario A tests** → Verify on EndiorBot itself
3. **Set up Dyad repo** → Prepare for Scenario B
4. **Document results** → Update test results in real-time
5. **File bugs** → Create GitHub issues for failures
6. **Iterate** → Fix issues, re-test

---

*Dogfooding Test Plan v1.0 | Test as you code*
*SDLC Framework v6.1.1 | Sprint 64*
