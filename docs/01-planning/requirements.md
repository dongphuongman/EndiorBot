# Requirements Specification

**Project:** EndiorBot
**Version:** 1.0.0
**Date:** 2026-02-21
**SDLC Stage:** 01-PLANNING

---

## Functional Requirements

### FR-001: Multi-Model Orchestrator

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-001.1 | Query multiple AI models in parallel (Claude, GPT, Gemini, Mistral) | P0 | Planned |
| FR-001.2 | Auto-select expert panel based on task type | P0 | Planned |
| FR-001.3 | Consolidate responses with consensus detection | P0 | Planned |
| FR-001.4 | Present disagreements with evidence | P1 | Planned |
| FR-001.5 | Support explicit consultation mode | P1 | Planned |
| FR-001.6 | Support single-model mode for speed | P1 | Planned |

### FR-002: Project Context Switching

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-002.1 | Quick switch between projects (Bflow, NQH-Bot, MTEP) | P0 | Planned |
| FR-002.2 | Preserve conversation history on switch | P0 | Planned |
| FR-002.3 | Preserve SDLC state (stage, gates) on switch | P0 | Planned |
| FR-002.4 | Warn about uncommitted changes | P1 | Planned |
| FR-002.5 | Support up to 5 concurrent project contexts | P1 | Planned |

### FR-003: SDLC Gate Automation

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-003.1 | Auto-evaluate gate criteria (G0-G4, G-Sprint) | P0 | Planned |
| FR-003.2 | Generate gate checklist based on tier | P0 | Planned |
| FR-003.3 | Collect evidence automatically | P0 | Planned |
| FR-003.4 | Calculate Vibecoding Index | P0 | Planned |
| FR-003.5 | Support manual override with reason | P1 | Planned |

### FR-004: Document Generation

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-004.1 | Auto-generate CRP from git commits | P1 | Planned |
| FR-004.2 | Auto-generate MRP from PR | P1 | Planned |
| FR-004.3 | Auto-generate VCR from test results | P1 | Planned |

### FR-005: Security Layer

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-005.1 | Input sanitization (12 injection patterns) | P0 | Planned |
| FR-005.2 | Output scrubbing (6 credential patterns) | P0 | Planned |
| FR-005.3 | Shell command guard | P0 | Planned |
| FR-005.4 | Secret detection before commit | P1 | Planned |

### FR-006: Quality Layer

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-006.1 | Reflect step after tool execution | P1 | Planned |
| FR-006.2 | History compaction at 80% capacity | P1 | Planned |
| FR-006.3 | Query classification for model routing | P1 | Planned |

### FR-007: CLI Interface

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-007.1 | `endiorbot start <project>` - Start project | P0 | Planned |
| FR-007.2 | `endiorbot switch <project>` - Switch context | P0 | Planned |
| FR-007.3 | `endiorbot gate status` - Show gate status | P0 | Planned |
| FR-007.4 | `endiorbot consult <query>` - Multi-model query | P0 | Planned |
| FR-007.5 | `endiorbot config` - Configuration management | P1 | Planned |

---

## Non-Functional Requirements

### NFR-001: Performance

| ID | Requirement | Target | Priority |
|----|-------------|--------|----------|
| NFR-001.1 | CLI startup time | < 1 sec | P0 |
| NFR-001.2 | Context switch latency | < 2 sec | P0 |
| NFR-001.3 | Memory per project | < 200 MB | P1 |
| NFR-001.4 | Model query timeout | 30s/model, 60s total | P0 |

### NFR-002: Scalability

| ID | Requirement | Target | Priority |
|----|-------------|--------|----------|
| NFR-002.1 | Support codebase size | ~1M LOC | P0 |
| NFR-002.2 | Concurrent projects | 5 max | P1 |
| NFR-002.3 | Token budget (ENTERPRISE) | 200K tokens | P0 |

### NFR-003: Security

| ID | Requirement | Target | Priority |
|----|-------------|--------|----------|
| NFR-003.1 | API keys in OS keychain | Required | P0 |
| NFR-003.2 | Never log sensitive data | Required | P0 |
| NFR-003.3 | Localhost-only gateway | Required | P0 |

### NFR-004: Reliability

| ID | Requirement | Target | Priority |
|----|-------------|--------|----------|
| NFR-004.1 | Daily backups | Last 7 days | P1 |
| NFR-004.2 | Weekly backups | Last 4 weeks | P2 |
| NFR-004.3 | Gate evidence retention | 90 days | P1 |

---

## Technical Constraints

| Constraint | Description |
|------------|-------------|
| TC-001 | TypeScript ES2022, NodeNext module resolution |
| TC-002 | Must work with Claude Code VSCode extension |
| TC-003 | No heavy infrastructure (no DB, Redis, MinIO) |
| TC-004 | SDLC Framework v6.1.1 compliance |
| TC-005 | macOS primary, Windows/Linux secondary |

---

## Dependencies

| Dependency | Version | Purpose |
|------------|---------|---------|
| Node.js | 22+ | Runtime |
| TypeScript | 5.8+ | Language |
| pnpm | 10+ | Package manager |
| Anthropic SDK | Latest | Claude API |
| OpenAI SDK | Latest | GPT API |
| Google AI SDK | Latest | Gemini API |

---

## Acceptance Criteria

| Criterion | Measurement |
|-----------|-------------|
| All P0 requirements implemented | 100% |
| Build passes | `pnpm build` success |
| Tests pass | `pnpm test` > 80% coverage |
| CLI functional | All commands work |
| SDLC compliant | Validator passes |

---

*SDLC Framework v6.1.1 - Stage 01: Planning*
