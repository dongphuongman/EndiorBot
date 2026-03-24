# Research: everything-claude-code (ECC) — Adopt/Adapt/Defer/Reject Analysis

**Date**: 2026-03-22
**Sprint**: 115 (Gate Deliverable R1)
**Researchers**: @pm + @architect
**Authority**: CEO directive — research before Sprint 115 T1/T2 approval
**Status**: COMPLETE

---

## Executive Summary

**everything-claude-code** (ECC) by affaan-m is the most mature Claude Code agent harness (84K+ stars, MIT license, 28 agents, 108+ skills, 57+ commands, 1,282 tests at 98% coverage). CEO directed research before approving Sprint 115's RL prompt injection (T1) and workspace context integration (T2).

**Conclusion:** EndiorBot and ECC serve fundamentally different purposes. ECC is a developer harness wrapping Claude Code CLI (single-user, per-session). EndiorBot is a CEO product with multi-channel delivery (Telegram/Zalo/Web, bus async, RL pipeline). Of 18 ECC capabilities evaluated, **9 are already implemented** in EndiorBot (equivalent or superior), **2 validate Sprint 115 designs**, and **4 provide future enhancements**.

**Score: 2 ADOPT, 4 ADAPT, 3 DEFER, 9 REJECT**

---

## Adopt/Adapt/Defer/Reject Table

| # | ECC Capability | Verdict | Sprint | Rationale |
|---|---------------|---------|--------|-----------|
| 1 | On-demand skill loading (54% context reduction) | **ADAPT** | 117+ | SOULs already role-specific; could lazy-load preambles. Not needed for T1/T2. |
| 2 | Hook lifecycle events (PostToolUse, PreCompact) | **ADOPT partially** | 116 | HMAC hooks exist (Sprint 86); add PostToolUse auto-format + PreCompact context-save. |
| 3 | Instinct micro-patterns (confidence 0.3-0.9) | **ADAPT for T1** | 115 | Directly applicable: add confidence scoring to PromptEnrichment patterns. |
| 4 | Token optimization (Sonnet 80%) | **REJECT** | — | Already: `TIER_AGENT_MODEL_MAP` + `DEFAULT_MODEL = sonnet` (Invariant #4). |
| 5 | Agent isolation (subprocess, restricted tools) | **REJECT** | — | Already: tmux + READ/PATCH/INTERACTIVE + allowed-tools in SOUL frontmatter. |
| 6 | Memory persistence (auto-save/load via hooks) | **ADAPT** | 117+ | ClawVault FactStore exists; needs lifecycle wiring (SessionStart loads, Stop saves). |
| 7 | Security: isolation over trust | **REJECT** | — | EndiorBot exceeds ECC: HMAC-SHA256, nonce TTL, timingSafeEqual, audit logging. |
| 8 | Verification loops (plan→act→verify) | **REJECT** | — | State machine (9 states, 18 transitions), CheckpointScheduler, FailureClassifier. |
| 9 | 28 specialized subagents | **DEFER** | 118+ | 13 SOULs cover CEO use case. Expand only on demand. |
| 10 | 57+ slash commands | **REJECT** | — | 30 OTT commands + @mention routing is the EndiorBot pattern. |
| 11 | 14 MCP server configs | **DEFER** | 118+ | MTClaw bridge (Sprint 113) is the single enterprise MCP. |
| 12 | Rules system (language-specific) | **REJECT** | — | CLAUDE.md + SOUL frontmatter IS the rules system. Invariant #1: thin client. |
| 13 | Context window compaction (strategic at 50%) | **REJECT** | — | Architecture mismatch: EndiorBot constructs per-turn (≤2K), no compaction needed. |
| 14 | Prompt enrichment from learned behaviors | **ADOPT** | 115 T1 | Validates T1 design. Enhancement: confidence scoring + recency weighting. |
| 15 | Workspace context in agent calls | **ADOPT** | 115 T2 | Validates T2 design. Enhancement: mode-aware (PATCH only) + env opt-out. |
| 16 | Confidence-filtered output (>80% threshold) | **ADAPT for T1** | 115 T1 | Apply confidence >= 0.5 (Phase 1, cold-start) → tighten to 0.7 at 100+ samples. |
| 17 | Cross-platform harness (Claude Code + Cursor + Codex) | **REJECT** | — | EndiorBot = product, not harness. Multi-channel = TG/Zalo/Web, not multi-IDE. |
| 18 | Continuous learning `/evolve` | **DEFER** | 118+ | Premature. Need 200+ RL records before pattern evolution is meaningful. |

---

## Impact on Sprint 115 T1/T2

### T1 (RL Prompt Injection) — Validated + Enhanced

ECC's instinct system confirms the pattern extraction → injection design. Specific enhancements adopted:
- **Confidence scoring**: `confidence = min(1.0, (feedbackCount / 5) * recencyWeight)` — divisor `/5` for cold-start realism
- **Phase 1 threshold**: `>= 0.5` (tighten to 0.7 at `MIN_SAMPLES_FOR_STRONG = 100`)
- **C7 fix**: exact agent key match (not `.includes()`)
- **Budget**: ≤200 chars enrichment section

### T2 (Workspace Context) — Validated + Enhanced

ECC injects git context similarly. EndiorBot adds:
- **Mode-aware**: PATCH/INTERACTIVE only (READ skips)
- **Opt-out**: `ENDIORBOT_DISABLE_WORKSPACE_CONTEXT=1`
- **Budget**: ≤100 chars

### Combined T1+T2 Budget

≤300 chars (~75 tokens). Injection order: workspace first, enrichment second.

---

## CPO Evaluation Criteria Compliance

| Criterion | Result |
|-----------|--------|
| Khớp kiến trúc (thin client, logic in src/) | ✅ All implementations in src/, no business logic in .md |
| Không phá SSOT (GatewayIngress + CommandDispatcher + bus) | ✅ Injection happens in channel-router.ts callAI(), no new SSOT |
| Privacy (CEO local repo, OTT, JSONL RL) | ✅ Opt-out env var, mode-aware injection, 200-char budget |
| Chi phí bảo trì (few deps, mock-testable) | ✅ Zero new dependencies, all cache-first with TTL |
| Khác biệt EndiorBot vs ECC | ✅ 9/18 REJECT confirms no duplication, product vs harness |

---

## Sources

| Source | URL | Accessed |
|--------|-----|----------|
| Main repo | https://github.com/affaan-m/everything-claude-code | 2026-03-22 |
| CLAUDE.md | https://github.com/affaan-m/everything-claude-code/blob/main/CLAUDE.md | 2026-03-22 |
| AGENTS.md | https://github.com/affaan-m/everything-claude-code/blob/main/AGENTS.md | 2026-03-22 |
| Architecture | https://deepwiki.com/affaan-m/everything-claude-code | 2026-03-22 |
| Security guide | https://github.com/affaan-m/everything-claude-code/blob/main/the-security-guide.md | 2026-03-22 |
| Token optimization | https://github.com/affaan-m/everything-claude-code/blob/main/docs/token-optimization.md | 2026-03-22 |

**Repo stats**: 84K+ stars, 28 agents, 108+ skills, 57+ commands, 1,282 tests (98% coverage), MIT license.

---

*Research complete. Gate R1 satisfied. CPO: please review and ungate Track B (T1/T2).*
