# RL Validation Set v1 — Sprint 110.5 Track C

**Purpose**: Kill-criteria measurement for OpenClaw-RL training quality.
**Usage**: Blind A/B eval — CEO ranks trained Qwen vs baseline (untrained) on same 80 prompts without knowing the source.
**Kill trigger**: Win rate <50% trained vs untrained after 200 samples (A/B), OR validation set score drop >10%.
**Format**: Each entry has a `prompt` (what CEO sends) and `ideal_signals` (what a good response must contain).
**ADR**: ADR-033 Kill Criteria
**Version**: v1 (2026-03-16, Sprint 110.5 Track C)

---

## Scoring Guide

Each response scored on 3 axes (1–5):
- **Accuracy** — factually correct, role-appropriate
- **Conciseness** — no padding, no repetition, answer-first
- **Actionability** — CEO can act on it immediately

Score = mean of 3 axes. Pass threshold per role: ≥3.5 average across 20 prompts.

---

## Role: @pm — Product Manager (20 prompts)

> Focus: WHAT to build, requirements, user stories, PRD, backlog priority, business value.

### P1–P5: Simple / Direct

| # | Prompt | Ideal signals |
|---|--------|--------------|
| P1 | `@pm what is a user story?` | Definition, format (As a... I want... So that...), acceptance criteria mention |
| P2 | `@pm write acceptance criteria for a login feature` | Bullet list, measurable conditions, edge cases (wrong password, lockout) |
| P3 | `@pm what's the difference between a PRD and a user story?` | PRD = strategic scope doc; user story = implementable unit; relationship explained |
| P4 | `@pm define MVP for a Telegram bot` | Minimal set of features, avoid scope creep, user value focus |
| P5 | `@pm what does G1 gate mean in our SDLC?` | G1 = Requirements Complete; what artifacts are required; who approves |

### P6–P15: Medium Complexity

| # | Prompt | Ideal signals |
|---|--------|--------------|
| P6 | `@pm write a user story for the RL feedback keyboard (👍🔄👎)` | As CEO, I want to rate agent responses, so that EndiorBot learns from my preferences; acceptance criteria includes keyboard appears, 3 options, correlationId |
| P7 | `@pm prioritize: (A) add Zalo channel (B) improve agent response time (C) RL feedback collection` | Prioritization framework (impact × effort or MoSCoW); explicit ranking with rationale |
| P8 | `@pm what are the risks of shipping RL training before collecting 20+ samples?` | Underfitting, divergence, no baseline to compare against, kill criteria won't be measurable |
| P9 | `@pm write a problem statement for EndiorBot's lack of feedback loop` | Current state → gap → impact → proposed solution format |
| P10 | `@pm how do I decide if a feature is P0 vs P1 vs P2?` | Criteria: user blocking (P0) vs significantly impaired (P1) vs nice-to-have (P2); examples |
| P11 | `@pm what should the sprint goal for Sprint 111a be?` | References RL training, Tinker rollout, shadow mode, Qwen rollout collection — concrete and measurable |
| P12 | `@pm how do we measure success for the RL feedback loop?` | feedbackRate > 15%, win rate > 50% vs baseline, validation set score; ties to kill criteria |
| P13 | `@pm write a one-paragraph executive summary for Sprint 110 (RL Feedback Capture)` | What was built, why it matters, what it enables, delivery status |
| P14 | `@pm what's the acceptance criteria for the CEO-visible 👍🔄👎 keyboard?` | Keyboard appears after agent response, 3 options, correct callback, no keyboard on non-trainable turns |
| P15 | `@pm how would you structure a backlog for Q2 2026 RL roadmap?` | Epics: capture (done), training (111a), rollout (111b), improvement (112); sprint breakdown |

### P16–P20: Complex / Strategic

| # | Prompt | Ideal signals |
|---|--------|--------------|
| P16 | `@pm what questions should I ask before committing to RLHF for EndiorBot?` | Data volume, feedback quality, training cost, kill criteria, fallback plan, timeline |
| P17 | `@pm design a feature flag strategy for safely rolling out trained Qwen to CEO` | ENABLE_RL_TIER flag, gradual rollout, A/B comparison, rollback trigger |
| P18 | `@pm write a one-page PRD for hint capture (👎 → "What was wrong?" follow-up)` | Problem, users, features, acceptance criteria, out-of-scope, success metrics |
| P19 | `@pm if the feedback rate stays below 5% after 2 weeks, what do you recommend?` | Kill criteria triggered, investigate UX friction, consider auto-feedback, stop training, archive data |
| P20 | `@pm compare: (A) collect 200 samples before training vs (B) train every 20 samples incrementally` | Tradeoffs: batch stability vs faster learning; recommends B with kill-criteria monitoring |

---

## Role: @architect — Software Architect (20 prompts)

> Focus: HOW to design, ADRs, system architecture, API contracts, technology choices, non-functional requirements.

### A1–A5: Simple / Direct

| # | Prompt | Ideal signals |
|---|--------|--------------|
| A1 | `@architect what is an ADR?` | Architecture Decision Record; structure (context, decision, rationale, consequences, status); why important |
| A2 | `@architect explain the event bus pattern in EndiorBot` | Publisher/subscriber, BusInboundMessage, BusConsumer, non-blocking, ADR-032 reference |
| A3 | `@architect what's the difference between Tier 1 and Tier 4 in the provider chain?` | Tier 1 = Claude primary; Tier 4 = trained Qwen (ENABLE_RL_TIER), fallback order, silent skip |
| A4 | `@architect why does the RL hook live in telegram-channel.ts and not ingress.ts?` | ingress.ts never sees message_id; channel layer is where Telegram response is generated; ADR-033 D3 |
| A5 | `@architect what's the single responsibility of BusConsumer?` | Translate BusInboundMessage → ingress.handleInbound → replyFn; NOT routing, NOT formatting |

### A6–A15: Medium Complexity

| # | Prompt | Ideal signals |
|---|--------|--------------|
| A6 | `@architect design the data flow from CEO tapping 👍 to the JSONL record being written` | Telegram callback → handleCallbackQuery → feedbackService.onFeedback → tracker.recordFeedback → dataStore.append → disk |
| A7 | `@architect should correlationId be UUID or timestamp-based? what are the tradeoffs?` | UUID = globally unique, no collision; timestamp = debuggable, sortable, slight collision risk at scale; EndiorBot uses timestamp (acceptable at CEO scale) |
| A8 | `@architect how does the 30-min session idle timeout interact with long agent tasks?` | Session stays open as long as messages within 30 min; long task = single turn, no timeout issue; addTurn() refreshes lastActivityAt |
| A9 | `@architect what would break if we removed the BusDedup?` | Telegram webhook retries would process same message twice; duplicate agent responses; dedup uses dedupKey from message_id |
| A10 | `@architect design a schema migration strategy for RLRecord when we add the hint field in Sprint 112` | schema_version field already in record; migration: add `hint?` as optional, backfill null for v1 records; no breaking change |
| A11 | `@architect why does Tinker require log-probs but our Sprint 110 JSONL has only text?` | Tinker = online training (captures log-probs during generation); Sprint 110 = offline capture (CEO → Claude, no Qwen inference); ADR-033 D10 |
| A12 | `@architect what port does the Tinker training proxy use and what conflict risk exists?` | Port 30000 default; conflict with openclaw_api_server.py (same port); never run simultaneously; configure PROXY_PORT if needed |
| A13 | `@architect design the fallback chain when OpenClaw-RL is unavailable during Sprint 111b` | Tier 4 timeout → skip silently → continue to next tier; user never sees RL error; ENABLE_RL_TIER=false disables entirely |
| A14 | `@architect what's the blast radius of a bug in RLFeedbackService?` | Limited to RL keyboard + JSONL writes; does not affect agent responses, routing, or chat; worst case = no feedback data collected |
| A15 | `@architect how does the BusDebounce 500ms window affect RL correlation IDs?` | Debounce coalesces rapid messages → last message wins; earlier messages' correlationIds are dropped; not a problem (only one response per session anyway) |

### A16–A20: Complex / Strategic

| # | Prompt | Ideal signals |
|---|--------|--------------|
| A16 | `@architect design the offline SFT pipeline for Sprint 110 JSONL data (HuggingFace path)` | Load JSONL, filter feedback_label=good, format as chat template, SFTTrainer, eval on validation set, save LoRA adapter |
| A17 | `@architect what are the risks of training on Claude outputs vs training on Qwen outputs?` | Claude outputs = distillation (covariate shift risk); Qwen outputs = on-policy (valid GRPO); mixing = invalid gradients; ADR-033 D2 |
| A18 | `@architect propose the architecture for hint capture in Sprint 112` | Intercept next message before bus publish; pending-feedback.json state; 5-min window; hint routes to feedbackService not agent; complex interceptor in telegram-channel.ts |
| A19 | `@architect if we wanted to add Zalo feedback (🌟/👎) using the same RL pipeline, what would change?` | ZaloChannel needs sendMessageWithId + setFeedbackService; correlationId in replyFn opts (already done); separate keyboard format |
| A20 | `@architect what non-functional requirements should govern the RL training run?` | Idempotent (restart-safe), checkpoint every 20 steps, loss curve logged to wandb, kill criteria enforceable, data archived on divergence |

---

## Role: @coder — Developer (20 prompts)

> Focus: Implementation, TypeScript patterns, testing, debugging, refactoring, production-quality code.

### C1–C5: Simple / Direct

| # | Prompt | Ideal signals |
|---|--------|--------------|
| C1 | `@coder what does exactOptionalPropertyTypes do in TypeScript?` | Prevents assigning undefined to optional fields; must use conditional assignment pattern; build errors otherwise |
| C2 | `@coder write a type-safe helper to parse "rl_fb:{label}:{correlationId}" callback data` | Handle correlationId containing colons; use indexOf not split; return null for malformed; TypeScript return type |
| C3 | `@coder how do I mock node:fs in vitest?` | `vi.mock("node:fs", ...)` at top of file (hoisted); import mocked fn after; use `vi.mocked(appendFileSync).mock.calls` |
| C4 | `@coder what's the difference between vi.fn() and vi.spyOn()?` | vi.fn() = standalone mock; vi.spyOn() = wraps real method, can restore; when to use each |
| C5 | `@coder fix: TypeScript error "Type 'undefined' is not assignable to type 'string'"` | exactOptionalPropertyTypes; show conditional assignment pattern |

### C6–C15: Medium Complexity

| # | Prompt | Ideal signals |
|---|--------|--------------|
| C6 | `@coder implement expireStale() in RLSessionTracker — mark turns older than 2h as expired` | Iterate all sessions, filter turns where createdAt < now-2h AND feedbackStatus=missing, set status=expired, return correlationIds |
| C7 | `@coder write a test for the case where onFeedback() is called with an orphan correlationId` | No prior onAgentResponse(); expect no throw; expect dataStore.append not called; expect eventLog.append not called |
| C8 | `@coder how do I pass correlationId from BusConsumer to TelegramChannel via replyFn?` | ChannelSendFn opts, consumer.ts sendOpts, telegram-ott-adapter extracts opts.correlationId, channel.send receives it |
| C9 | `@coder the keyboard doesn't appear after @pm hello. How do you debug?` | Check: setFeedbackService called? isTrainableTurn=true? telegramMessageId returned? provider!=system? Check each phase |
| C10 | `@coder write sendMessageWithId() for TelegramChannel` | POST to Telegram sendMessage, return result.message_id (number) or null on failure; NOT replace sendMessage() |
| C11 | `@coder refactor: globalTurnCounter module-level let → instance field` | `private turnCounter = 0`; remove module-level let; change `++globalTurnCounter` to `++this.turnCounter`; test isolation benefit |
| C12 | `@coder how do you append a JSONL record safely if the directory doesn't exist yet?` | mkdirSync with recursive:true before appendFileSync; try-catch for write failure; increment writeFailures on error |
| C13 | `@coder write a test that verifies the 👍 feedback creates a record with reward:1 and hint:null` | onAgentResponse() with telegramMessageId; onFeedback("good"); inspect dataStore.append call; check reward, hint, schema_version |
| C14 | `@coder implement the 15-minute expiry timer in serve.ts` | setInterval → feedbackService.expireStale(); 15*60*1000; components[] push with clearInterval; before OTT adapters |
| C15 | `@coder what's the correct way to clear a setInterval in an async shutdown handler?` | Store timer ref; clearInterval(ref) in stop() callback; no await needed; order: Telegram stops before RLFeedbackService |

### C16–C20: Complex / Strategic

| # | Prompt | Ideal signals |
|---|--------|--------------|
| C16 | `@coder implement the full 3-button inline keyboard attachment in TelegramChannel after sendMessageWithId()` | Build InlineKeyboardMarkup with 3 buttons; callback_data = "rl_fb:good:{correlationId}" etc; call sendRequest for answerCallbackQuery |
| C17 | `@coder write the rl_fb callback handler — parse label + correlationId, call feedbackService.onFeedback()` | Parse "rl_fb:{label}:{correlationId}"; handle correlationId with colons; call onFeedback; answerCallbackQuery("✅"); silent drop on orphan |
| C18 | `@coder how would you write a data loader for Sprint 110 JSONL → HuggingFace SFTTrainer format?` | Load JSONL line by line; filter feedback_label=good; format as [{role: "user", content: messages}, {role: "assistant", content: response}]; output dataset |
| C19 | `@coder design a retry + circuit-breaker for RLDataStore.append() to handle disk-full` | Try append; catch ENOSPC; increment writeFailures; after 3 failures, set circuit open; log warning; do not block feedback UI |
| C20 | `@coder the event log grows unbounded. Design a rotation strategy` | Daily rotation (new file per day); keep last N days; configurable via env; do not rotate mid-day; no impact on kill-criteria measurement |

---

## Role: @reviewer — Code Reviewer (20 prompts)

> Focus: Code quality, security, test coverage, ADR compliance, PR approval/rejection criteria.

### R1–R5: Simple / Direct

| # | Prompt | Ideal signals |
|---|--------|--------------|
| R1 | `@reviewer what do you check first when reviewing a PR?` | Tests exist and pass; ADR compliance; blast radius; security (input validation, no secrets); no breaking changes |
| R2 | `@reviewer what's a Must-Fix vs Should-Fix vs Informational?` | MF = blocks merge; SF = fix before next sprint; Info = documentation/style; severity affects merge decision |
| R3 | `@reviewer is it okay to use `any` in TypeScript?` | No; use `unknown` for truly unknown; use proper types; cast with `as` only when necessary and documented |
| R4 | `@reviewer how do you verify a test is actually testing what it claims?` | Mutation testing mindset; remove the feature and check test fails; check assertion is on the right value |
| R5 | `@reviewer what security issues should you look for in a Telegram webhook handler?` | chatId allowlist; input sanitization; rate limiting; no secrets in responses; callback data validation |

### R6–R15: Medium Complexity

| # | Prompt | Ideal signals |
|---|--------|--------------|
| R6 | `@reviewer review this: "const data = JSON.parse(callbackData)"` | No try-catch; JSON.parse can throw; must wrap in try-catch; return null/undefined on parse failure |
| R7 | `@reviewer the PR adds setFeedbackService() but no test for the null case. Is this acceptable?` | No; null case (feedbackService never set) must be tested; feedback silently disabled is a valid production path |
| R8 | `@reviewer a developer skipped tests for appendFileSync because "it's just I/O". Approve or reject?` | Reject; I/O behavior must be tested with mocks; JSONL format validation is critical for pipeline; cite data-store.test.ts T3 as pattern |
| R9 | `@reviewer what's wrong with this: `export const counter = { value: 0 }`?` | Module-level mutable state; shared across tests; causes test pollution; use class instance or factory function |
| R10 | `@reviewer the PR uses `setTimeout(fn, 15 * 60 * 1000)` instead of `setInterval`. What's the difference?` | setTimeout fires once; setInterval fires repeatedly; expireStale() should be periodic → setInterval required |
| R11 | `@reviewer check ADR compliance for a new file that adds database writes to ingress.ts` | Violation: ingress.ts should be channel-agnostic; no channel-specific metadata (ADR-033 D3); must-fix |
| R12 | `@reviewer the PR doesn't include backward-compat tests for createTelegramOttAdapter() without feedbackService. Issue?` | Yes — backward compat is a contract; T2 in ott-serve-wiring.test.ts is exactly this; must be present |
| R13 | `@reviewer how many tests are "enough" for a new module like src/rl/?` | Cover: happy path, error/null path, boundary conditions, orphan/unknown inputs; minimum 3-5 per exported function |
| R14 | `@reviewer what's your verdict on a PR with 16 new tests and 0 must-fix findings?` | Approved — but check: all tests pass, no skipped tests, no console.log left in production code, build clean |
| R15 | `@reviewer the developer used split(":") to parse "rl_fb:good:telegram-ceo-123:456". What's the bug?` | correlationId contains colons (telegram-ceo-123:456); split(":") produces 4 parts not 3; must use indexOf twice to find label + correlationId boundary |

### R16–R20: Complex / Strategic

| # | Prompt | Ideal signals |
|---|--------|--------------|
| R16 | `@reviewer do a security review of the rl_fb callback handler` | Validate callback_data format; label must be in allowlist (good/partial/bad); correlationId must not be executable; silent drop on invalid; no PII logged |
| R17 | `@reviewer review: RLFeedbackService constructor accepts optional deps but creates defaults internally` | Good pattern (DI for tests, zero-config for production); verify default args don't use globals; test isolation confirmed |
| R18 | `@reviewer the PR exposes getStats() on RLFeedbackService publicly. Is this correct?` | Yes if needed for health reporting; verify it returns a snapshot (not live reference); no mutations via getStats(); used in /api/status |
| R19 | `@reviewer a new Sprint adds chatId directly into correlationId format: "chat-{chatId}-{ts}". Approve?` | Concern: chatId may contain special characters; existing format "telegram-{senderId}-{ts}" is safer; recommend test with special chars; minor issue |
| R20 | `@reviewer the train loop in trainer.py has no unit tests. How do you handle this in PR review?` | Python code outside TypeScript scope; note as informational; recommend integration test (run with mock Tinker client); not a blocker for Sprint 110.5 |

---

## Usage Instructions

### A/B Eval Protocol

**Fixed eval set** (same 10 prompts per role used in every eval round for consistent training iteration comparisons):

| Role | Fixed 10 prompts |
|------|-----------------|
| @pm | P2, P5, P7, P9, P11, P12, P15, P17, P18, P19 |
| @architect | A3, A5, A7, A9, A11, A13, A15, A17, A18, A20 |
| @coder | C2, C4, C6, C8, C10, C12, C14, C16, C18, C20 |
| @reviewer | R3, R5, R7, R9, R11, R13, R15, R17, R19, R20 |

> **Rationale (SF-1 fix)**: Fixed prompts ensure Sprint 111a vs 111b comparison is apples-to-apples. Random re-sampling across rounds introduces variance that can mask real quality changes. The remaining 10 prompts per role are reserved for spot-checks and future eval rounds.

1. Use the **fixed prompt set above** (not random sampling) for training iteration comparisons
2. Send each prompt to both: **baseline Qwen** (untrained) and **trained Qwen** (LoRA)
3. Present responses to CEO as "Option A" / "Option B" (randomized order, no label)
4. CEO scores each 1–5 on Accuracy, Conciseness, Actionability
5. Compute: `winRate = trainedWins / totalPrompts`
6. Kill trigger: `winRate < 50%` after 40 prompts (10 per role)
7. Relationship to ADR-033 200-sample threshold: the 40-prompt eval is per-round; 200 is the cumulative sample count across rounds before declaring final verdict

### Kill Criteria Check

```
feedbackRate  = feedbackReceived / trainableTurns  (from event log)
winRate       = trainedWins / (trainedWins + baselineWins)  (from validation set)
validationDrop = (baselineScore - trainedScore) / baselineScore

KILL if: feedbackRate < 0.15 after 4 weeks
      OR winRate < 0.50 after 200 samples
      OR validationDrop > 0.10
      OR Tinker loss increases (Sprint 111a first run)
```

---

**Author**: @pm + @architect
**Version**: v1 — 2026-03-16
**Sprint**: 110.5 Track C
**Next update**: After Sprint 111a first training run (add scored baselines)
