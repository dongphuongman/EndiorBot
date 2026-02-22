# User Stories

**Project:** EndiorBot
**Version:** 1.0.0
**Date:** 2026-02-21
**SDLC Stage:** 01-PLANNING

---

## Epic 1: Multi-Model AI Orchestration

### US-1.1: Automatic Expert Consultation

**As a** solo developer
**I want to** query multiple AI models automatically
**So that** I get diverse expert opinions without manual copy/paste

**Acceptance Criteria:**
- [ ] Can configure expert panel (Claude, GPT, Gemini, Mistral)
- [ ] Queries are sent in parallel
- [ ] Responses are consolidated with consensus detection
- [ ] Disagreements are highlighted with evidence
- [ ] Total query time < 60 seconds

**Story Points:** 8

---

### US-1.2: Task-Based Model Routing

**As a** solo developer
**I want to** have the right models selected based on task type
**So that** I get the best expertise for each situation

**Acceptance Criteria:**
- [ ] Architecture tasks → Claude + GPT + Gemini
- [ ] Code generation → Claude only (fast)
- [ ] Security review → Claude + GPT (cross-validation)
- [ ] Research → Gemini + Claude (latest data)

**Story Points:** 5

---

### US-1.3: Single Model Mode

**As a** solo developer
**I want to** force single model mode when I need speed
**So that** I can get quick answers without consultation overhead

**Acceptance Criteria:**
- [ ] `endiorbot --model opus "quick fix"` uses Claude only
- [ ] No consolidation step
- [ ] Response time < 10 seconds for simple queries

**Story Points:** 3

---

## Epic 2: Project Context Management

### US-2.1: Quick Project Switch

**As a** solo developer
**I want to** switch between projects instantly
**So that** I don't waste time re-establishing context

**Acceptance Criteria:**
- [ ] `endiorbot switch bflow` switches to Bflow
- [ ] Previous context saved automatically
- [ ] New context loaded with SDLC state
- [ ] Switch completes in < 2 seconds

**Story Points:** 5

---

### US-2.2: Context Preservation

**As a** solo developer
**I want to** preserve conversation history when switching
**So that** I can resume where I left off

**Acceptance Criteria:**
- [ ] Conversation history saved on switch
- [ ] History compacted if > 80% token budget
- [ ] SDLC stage and gates preserved
- [ ] Active task state preserved

**Story Points:** 5

---

### US-2.3: Uncommitted Changes Warning

**As a** solo developer
**I want to** be warned about uncommitted changes
**So that** I don't lose work when switching projects

**Acceptance Criteria:**
- [ ] Detect uncommitted git changes
- [ ] Show warning before switch
- [ ] Option to stash or commit first

**Story Points:** 3

---

## Epic 3: SDLC Automation

### US-3.1: Automatic Gate Evaluation

**As a** solo developer
**I want to** auto-evaluate gate readiness
**So that** I don't manually track checklists

**Acceptance Criteria:**
- [ ] `endiorbot gate propose G2 AR-457` evaluates G2
- [ ] Checklist items auto-checked where possible
- [ ] Missing items clearly listed
- [ ] Vibecoding Index calculated
- [ ] Recommendation provided

**Story Points:** 8

---

### US-3.2: Evidence Collection

**As a** solo developer
**I want to** have evidence collected automatically
**So that** I have audit trail for gates

**Acceptance Criteria:**
- [ ] File references captured with hash
- [ ] Commit references captured
- [ ] Test results captured
- [ ] Evidence stored in `~/.endiorbot/evidence/`

**Story Points:** 5

---

### US-3.3: CRP Generation

**As a** solo developer
**I want to** auto-generate Change Request Packages
**So that** I don't write boilerplate documentation

**Acceptance Criteria:**
- [ ] Parse recent git commits
- [ ] Extract change summary
- [ ] Generate CRP markdown
- [ ] Include SDLC metadata

**Story Points:** 5

---

## Epic 4: Security & Quality

### US-4.1: Input Sanitization

**As a** solo developer
**I want to** have inputs sanitized automatically
**So that** I'm protected from injection attacks

**Acceptance Criteria:**
- [ ] SQL injection patterns blocked
- [ ] XSS patterns blocked
- [ ] Command injection blocked
- [ ] Path traversal blocked

**Story Points:** 5

---

### US-4.2: Output Scrubbing

**As a** solo developer
**I want to** have outputs scrubbed of secrets
**So that** I never accidentally leak credentials

**Acceptance Criteria:**
- [ ] API keys redacted
- [ ] Passwords redacted
- [ ] Tokens redacted
- [ ] AWS keys redacted

**Story Points:** 5

---

### US-4.3: Vibecoding Index

**As a** solo developer
**I want to** see code quality score before commit
**So that** I maintain high standards

**Acceptance Criteria:**
- [ ] Score 0-100 calculated
- [ ] Green (0-30), Yellow (31-60), Orange (61-80), Red (81-100)
- [ ] 5 quality signals measured
- [ ] Block commit if Red zone

**Story Points:** 5

---

## Epic 5: Junior Developer Support (Optional)

### US-5.1: Task Assignment

**As a** CEO
**I want to** assign tasks to junior developers
**So that** they have clear work items

**Acceptance Criteria:**
- [ ] Create task with description
- [ ] Assign to junior
- [ ] Junior sees assigned tasks on login
- [ ] AI assists junior with task

**Story Points:** 5

---

### US-5.2: Learning Mode

**As a** junior developer
**I want to** understand why AI suggests certain approaches
**So that** I learn best practices

**Acceptance Criteria:**
- [ ] AI explains decisions when Learning Mode ON
- [ ] References to documentation provided
- [ ] Best practices highlighted
- [ ] Alternative approaches discussed

**Story Points:** 3

---

### US-5.3: Sandbox Permissions

**As a** CEO
**I want to** restrict junior access to safe areas
**So that** they can't break production

**Acceptance Criteria:**
- [ ] Junior can't push to main/master
- [ ] Junior can't approve gates
- [ ] Junior can't access secrets
- [ ] All PRs require CEO approval

**Story Points:** 3

---

## Sprint Backlog Summary

| Epic | Stories | Total Points |
|------|---------|--------------|
| E1: Multi-Model | 3 | 16 |
| E2: Context | 3 | 13 |
| E3: SDLC | 3 | 18 |
| E4: Security | 3 | 15 |
| E5: Junior (Optional) | 3 | 11 |
| **Total** | **15** | **73** |

---

*SDLC Framework v6.1.1 - Stage 01: Planning*
