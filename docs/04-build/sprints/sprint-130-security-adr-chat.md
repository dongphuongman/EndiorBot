# Sprint 130 — Push + Security + ADR-045 + Chat Phase 3 + CRG Templates

**Date:** 2026-04-06
**Status:** COMPLETE
**Framework:** SDLC 6.2.1
**Authority:** CTO APPROVED + CPO APPROVED
**Baseline:** 7,601 tests passing, 0 failures

---

## Deliverables

### Step 1: Push Sprint 129 (16 commits)
- All Sprint 122-129 work pushed to remote
- Includes: OSS sanitization, BUG-001/012/013 fixes, 128 placeholder fixes
- Pre-push tag: `pre-sprint-129-push`

### Step 2: ADR-045 — Code Knowledge Graph (MCP Client)
- **Decision:** EndiorBot = MCP client (consumer), NOT graph engine
- AI-Platform hosts shared code-review-graph service (CTO 8.5/10, ADR-083)
- No tree-sitter, no better-sqlite3, no native deps in EndiorBot
- Integration planned for Sprint 131 when AI-Platform Sprint 105-106 ready
- Kill criteria: < 3x token reduction → REMOVE

### Step 3: Dependabot Vulnerabilities
- 5 core vulnerabilities patched via pnpm overrides:
  - minimatch (ReDoS), picomatch (ReDoS), brace-expansion (DoS),
    lodash (prototype pollution + code injection), xmldom (XML injection)
- 11 remaining HIGHs all in `apps/desktop` (Electron) — desktop app only, not npm package

### Step 4: Chat Mode Phase 3 — Tool Reads
- `/read <file>` — read file, add to AI context (60-line preview, 2000-char cap)
- `/grep <pattern>` — ripgrep search (20 matches max)
- `/glob <pattern>` — find files by pattern (30 results max)
- `/ls [dir]` — list directory contents
- Path traversal blocked, timeout protection, graceful error messages
- Tool output added to chat history so AI can reference it

### Step 5: CRG Tool Integration in SOUL + Team Templates
- **PREAMBLE.md** — CRG tools section for all 14 agents (optional, fail-soft)
- **SOUL-reviewer.md** — CRG capabilities + Impact Analysis checklist (step 0)
- **SOUL-architect.md** — CRG capabilities + code structure analysis
- **SOUL-coder.md** — CRG query capability
- **SOUL-tester.md** — CRG affected flows capability
- **TEAM-dev.md** — reviewer uses `crg_impact_radius` before review
- **TEAM-qa.md** — test impact analysis via `crg_affected_flows`
- **TEAM-design.md** — architect uses `crg_architecture_overview` before ADR

---

## Commits

```
0118c4a feat(agents): integrate CRG tools into SOUL templates + team workflows
adcf4b0 feat(chat): Phase 3 — tool reads (/read, /grep, /glob, /ls) in chat
719d2c2 fix(security): patch 5 Dependabot vulnerabilities via pnpm overrides
659eb8f docs(adr-045): Code Knowledge Graph — EndiorBot as MCP client
44dd029 docs(bugs): add BUG-012 report
```

## Verification

```bash
pnpm build          # Clean
pnpm test           # 7,601 pass, 0 fail
git log --oneline -6 # 6 Sprint 130 commits
```

---

*EndiorBot Sprint 130 | SDLC Framework 6.2.1*
