---
sprint: 141
status: DRAFT — awaiting G1 approval
start_date: 2026-04-24
planned_duration: 3-5d
framework: "6.3.1"
authority:
  proposer: "@pm"
  countersigners: []
  trigger: "Sprint 140 carry-forward + CEO request for cost telemetry dashboard"
  notes: |
    Sprint 141 validates ADR-052 in production by measuring actual cost savings,
    tuning Ollama confidence thresholds, and hardening Kimi fallback resilience.
    No new architectural decisions — execution-only sprint.
previous_sprint: "Sprint 140 — Kimi2.6 Integration + Agent-Model Tier Mapping"
references:
  - docs/02-design/01-ADRs/ADR-052-agent-model-tier-mapping.md
  - docs/04-build/sprints/sprint-140-plan.md
---

# Sprint 141 — Cost Telemetry + Ollama Confidence + Kimi Resilience

## Context

Sprint 140 delivered ADR-052 (Agent-Model Tier Mapping) with an **estimated 45–60% cost reduction**. Sprint 141 is the **validation sprint**: measure whether the estimate holds, tune the edge cases, and harden the fallback paths before declaring ADR-052 production-stable.

Three focus areas:
1. **Cost telemetry** — per-agent, per-provider cost tracking to validate savings
2. **Ollama confidence** — `@assistant` (Tier 3, Ollama primary) needs auto-escalation if quality drops
3. **Kimi resilience** — `@coder` and 9 other Tier-2 agents depend on Kimi; proxy rate-limits must not degrade UX

## Gate Status

| Gate | Requirement | Status | Evidence |
|------|-------------|--------|----------|
| G0.1 | Problem statement | ✅ | Sprint 140 SC-6 deferred; Ollama quality unknown; Kimi rate-limit unmeasured |
| G1 | Requirements complete | 📋 | This document (awaiting countersign) |
| G2 | ADR(s) | ✅ | ADR-052 already approved; no new ADRs needed |

---

## P0-1: Per-Agent Cost Telemetry Dashboard

**What:** Extend `metrics-collector` and `budget-tracker` to record cost per agent and per provider, then expose a CLI command `endiorbot cost report`.

**Why:** Sprint 140 estimated 45–60% savings. Without telemetry, this is a guess.

**Files:**
- `src/analytics/metrics-collector.ts` — add `byAgent` and `byProvider` cost aggregation
- `src/budget/budget-tracker.ts` — record `agent` and `provider` on every `recordCost()` call
- `src/cli/commands/cost.ts` — new `endiorbot cost report [--today|--week|--agent <name>]` command
- `src/providers/base-provider.ts` — standardize `tokenUsage` return to include `providerId`

**Success criteria:**
- SC-1: `endiorbot cost report --today` shows breakdown by agent + provider
- SC-2: Cost data persisted to `~/.endiorbot/metrics/YYYY-MM-DD.json`
- SC-3: After 3 days of usage, `@coder` cost < 40% of pre-ADR-052 `@coder` cost (Kimi vs old Claude Sonnet)

---

## P0-2: Ollama Confidence Auto-Escalation

**What:** `@assistant` (Tier 3, Ollama primary) currently has no quality gate. Add a lightweight confidence check: if Ollama response is too short, contains uncertainty markers, or fails a keyword match, escalate to Kimi automatically.

**Why:** Free is only free if quality is acceptable. CEO must not notice `@assistant` getting dumber.

**Files:**
- `src/agents/router/providers.ts` — `callRemoteOllama()` returns `{ content, confidence }`
- `src/agents/router/ollama-confidence.ts` — new module: heuristic confidence scorer
  - Response length < 50 chars → low confidence
  - Contains "I don't know" / "unsure" / "cannot" → low confidence
  - No structured routing decision detected when agent is `@assistant` → low confidence
- `src/agents/channel-router.ts` — if `confidence < 0.6`, retry with `dispatchAgentFallback()`

**Threshold tuning:**
| Confidence | Action |
|-----------|--------|
| ≥ 0.7 | Accept Ollama response |
| 0.5 – 0.69 | Accept but log warning |
| < 0.5 | Auto-escalate to Kimi |

**Success criteria:**
- SC-4: `@assistant` responses with confidence < 0.5 trigger Kimi fallback within 2s
- SC-5: Ollama escalation rate < 20% (if >20%, model is too weak — revisit Tier 3 assignment)

---

## P0-3: Kimi Proxy Rate-Limit Monitoring

**What:** Track Kimi proxy health (rate-limit hits, fallback to `kimi-api`, fallback to Claude). Expose metrics in `endiorbot cost report` and add alerting.

**Why:** CEO's `kimi-proxy` (OAuth via `claude-code-proxy`) is known to be rate-limited in practice. If Tier-2 agents hit rate limits frequently, user experience degrades.

**Files:**
- `src/providers/kimi-proxy/index.ts` — intercept 429 responses, increment counter
- `src/providers/kimi-proxy/rate-limit-monitor.ts` — new module: track 429s, fallback frequency, latency
- `src/agents/router/providers.ts` — `callKimiProvider()` logs fallback reason (proxy vs API)
- `src/cli/commands/cost.ts` — `endiorbot cost report --provider kimi` shows rate-limit stats

**Decision gate (Sprint 141 mid-point):**
- If Kimi proxy 429 rate > 30% of Tier-2 calls → promote `kimi-api` to co-primary (parallel query, winner-takes-all)
- If Kimi proxy 429 rate < 10% → keep current order, monitor only

**Success criteria:**
- SC-6: Rate-limit telemetry visible in `endiorbot cost report`
- SC-7: Fallback chain latency < 5s end-to-end (proxy fail → API succeed)

---

## P1-1: @consult ChatHandler Full Kimi Wiring

**What:** Sprint 140 added `kimi` to the CLI `--kimi` flag and `multi-model-orchestrator.ts`, but `ChatHandler` (`src/gateway/chat-handler.ts`) resolves `"kimi"` → `kimi-api`/`kimi-proxy` via a conditional block. Harden this to use the provider registry directly.

**Why:** Technical debt from rushed 3-model panel expansion.

**Files:**
- `src/gateway/chat-handler.ts` — replace conditional `providerId === "kimi"` resolution with registry lookup
- `src/providers/init.ts` — ensure `kimi-proxy` and `kimi-api` register with `models` array including `kimi-k2-6`

**Success criteria:**
- SC-8: `endiorbot consult "test" --kimi kimi-k2-6 --primary kimi` routes through provider registry, not hardcoded logic

---

## Sequencing

```
Day 1: P0-1 cost telemetry (metrics-collector + budget-tracker wiring)
Day 2: P0-2 Ollama confidence (heuristic scorer + fallback integration)
Day 3: P0-3 Kimi monitoring (rate-limit interceptor + reporting)
Day 4: P1-1 @consult hardening (registry lookup, cleanup)
Day 5: Integration testing + report validation
```

---

## Test Plan

| Component | Tests |
|-----------|-------|
| Cost telemetry | Unit: mock `recordCost()` with agent/provider; verify aggregation. CLI: `cost report` output parsing |
| Ollama confidence | Mock Ollama responses (short, unsure, valid) → verify escalation trigger at < 0.5 |
| Kimi monitoring | Mock 429 response → verify counter increment; mock timeout → verify fallback latency |
| @consult wiring | Integration: `consult` with `--primary kimi` hits registry, not conditional |

Estimated: ~15-20 new tests. Full regression against 8K+ tests.

---

## Success Criteria (Sprint-Level)

- **SSC-1:** `endiorbot cost report` produces readable breakdown (agent × provider matrix)
- **SSC-2:** Ollama escalation rate measured and < 20% for `@assistant`
- **SSC-3:** Kimi proxy 429 rate measured and decision gate documented
- **SSC-4:** `@consult --primary kimi` works end-to-end via registry
- **SSC-5:** Full test suite passes; `npx tsc --noEmit` clean

---

## Carry-Forward to Sprint 142

| Item | Trigger |
|------|---------|
| Promote `kimi-api` to co-primary | If P0-3 shows proxy 429 rate > 30% |
| Demote `@assistant` from Ollama | If P0-2 shows escalation rate > 20% |
| Cost optimization dashboard | If CEO wants real-time web dashboard instead of CLI |

---

*EndiorBot | CEO Power Tool (LOCKED, LOCAL-ONLY) | SDLC 6.3.1 | Sprint 141 Draft — 2026-04-23*
