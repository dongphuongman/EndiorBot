# CEO Requirements & Vision

**Version**: 1.0.0
**Date**: 2026-02-22

---

## Strategic Context

### Dual-Product Strategy

```
┌─────────────────────────────────────────────────────────────────┐
│                    CEO's Product Portfolio                       │
│                                                                  │
│   ┌─────────────────────┐     ┌─────────────────────┐          │
│   │     EndiorBot       │     │  SDLC Orchestrator  │          │
│   │ Personal Assistant  │────▶│  Commercial Product │          │
│   │   + Innovation Lab  │     │                     │          │
│   └─────────────────────┘     └─────────────────────┘          │
│                                                                  │
│   • AI tool experimentation    • Enterprise teams              │
│   • Automation research        • Multi-developer               │
│   • New feature testing        • Commercial licensing          │
│   • Personal productivity      • Productized features          │
└─────────────────────────────────────────────────────────────────┘
```

### EndiorBot's Role

1. **Personal AI Assistant**: CEO's daily productivity tool
2. **Innovation Lab**: Test new AI tools, automation techniques
3. **Feature Incubator**: Prove concepts before moving to SDLC Orchestrator
4. **Control Center**: Manage AI codex, tool usage, cost optimization

### Flow: EndiorBot → SDLC Orchestrator

```
Experiment in EndiorBot
        │
        ▼
Validate with CEO's real work
        │
        ▼
Refine based on feedback
        │
        ▼
Productize for SDLC Orchestrator
```

---

## Foundational Thinking Frameworks

### System Thinking: Iceberg 4-Layer Model

CEO applies this framework to analyze problems at the right level:

| Layer | Level | Response Type | EndiorBot Action |
|-------|-------|---------------|------------------|
| **Events** | Surface | Reactive | Auto-fix build/lint errors |
| **Patterns** | Trends | Anticipatory | Log patterns in fix-log.json |
| **Structures** | Architecture | Design | Escalate for ADR/refactor |
| **Mental Models** | Beliefs | Transformational | Multi-model consultation |

**Key Insight**: Most auto-fixes operate at Layer 1 (Events). Escalation moves to deeper layers where CEO input is needed.

### Self-Evolution via Iceberg Model

EndiorBot learns and evolves according to the Iceberg model:

```
Events (fix-log.json) → Patterns (weekly review) → Structures (update strategies) → Mental Models (paradigm shifts)
```

| Evolution Level | How EndiorBot Learns |
|-----------------|---------------------|
| **Event Learning** | Log every fix attempt, track success/fail |
| **Pattern Recognition** | CEO weekly review identifies recurring issues |
| **Structural Improvement** | Update fix strategies, routing rules |
| **Mental Model Evolution** | Shift assumptions about what can be auto-fixed |

**Goal**: EndiorBot becomes smarter over time, requiring less CEO intervention.

### Design Thinking: 5-Phase Process

CEO applies this framework for feature development:

| Phase | CEO Activity | EndiorBot Support |
|-------|--------------|-------------------|
| **Empathize** | Understand user needs | Research agent gathers context |
| **Define** | Frame problem | Generate ADR templates |
| **Ideate** | Generate solutions | Multi-model consultation |
| **Prototype** | Quick implementation | Parallel tracks, checkpoint/resume |
| **Test** | Validate solution | Self-correction loop, verify |

**Key Insight**: EndiorBot accelerates each phase while CEO maintains creative control.

---

## Core Requirements

### R1: Autonomous Operation (Primary)

> "EndiorBot có thể chạy liên tục 1-2h+ với human intervention tối thiểu"

| Metric | Current | Target |
|--------|---------|--------|
| Autonomous duration | 5 min | 2+ hours |
| Human interventions/hr | 10+ | <1 |
| Self-fix rate (build/lint) | 0% | 80%+ |

### R2: Multi-Track Parallel Work

> "Các track công việc độc lập có thể chạy song song"

| Track | Example |
|-------|---------|
| Research | Explore libraries, analyze code |
| Design | Write ADRs, architecture docs |
| Implement | Write code, fix bugs |
| Test | Run tests, fix failures |
| Review | Code review, quality check |

### R3: Self-Correction & Learning

> "EndiorBot có thể tự học hỏi, tự sửa lỗi và raise lên CEO khi cần"

| Error Type | Auto-Fix | Escalate |
|------------|----------|----------|
| Build/Lint/Type | ✅ | After 3 failures |
| Test failures | ⚠️ Experimental | Always notify |
| Architecture | ❌ | Always |
| Security | ❌ | Always |

### R4: Cost Optimization

> "Tối ưu hoá sử dụng tài nguyên AI: local Ollama + Cloud AI"

| Task | Resource | Cost |
|------|----------|------|
| Simple (lint, format) | Ollama | $0 |
| Medium (implement) | Haiku | $ |
| Complex (architecture) | Opus | $$$ |
| Overnight bulk | Ollama + Haiku | $$ |

### R5: Desktop Interface

> "CEO có thể dùng công cụ của chính mình, không cần mở VSCode"

- Port ClawX into EndiorBot
- Chat interface for AI interaction
- Dashboard for project context
- Settings for provider/budget config

### R6: AI Experimentation Platform

> "Nơi CEO thử nghiệm các công cụ AI, tính năng mới"

| Area | Experiments |
|------|-------------|
| AI Codex Control | Prompt optimization, output validation |
| Automation | Git automation, SDLC gates |
| Tool Integration | New AI models, local LLMs |
| Cost Management | Budget tracking, resource routing |

---

## Constraints

### C1: Solo Developer Context

- CEO is the only human developer
- Minimize interruptions during flow state
- Notifications must be actionable

### C2: Cost Sensitivity

```yaml
budget:
  daily_limit: $10
  per_session_limit: $2
  warning_threshold: 80%
```

### C3: Safety First

- Escalation protocols BEFORE increasing autonomy
- Human approval for architecture/security decisions
- Budget controls prevent runaway costs

### C4: TypeScript Strict Mode

- All code `strict: true`
- No `any` types
- Explicit typing throughout

### C5: SDLC Compliance

- Framework 6.1.1
- G-Sprint gates must pass
- Documentation within 24h of sprint close

---

## Success Criteria

### Short Term (Sprint 35-36)

- [ ] 30-min autonomous runs with checkpoint
- [ ] Budget control active
- [ ] Escalation protocols working

### Medium Term (Sprint 37-38)

- [ ] 1-hour autonomous runs
- [ ] Build/lint auto-fix at 80%
- [ ] Hybrid AI cost optimization

### Long Term (Sprint 39-40)

- [ ] 2+ hour autonomous runs
- [ ] Parallel tracks working
- [ ] Fix logging for pattern analysis

### Validation

- [ ] CEO can start work, leave for 2 hours, return to find progress made
- [ ] Costs stay within budget
- [ ] Quality doesn't degrade (build passes, tests pass)
- [ ] Escalations are clear and actionable

---

## Anti-Goals

| Don't Do | Reason |
|----------|--------|
| Build enterprise team features | Solo developer tool |
| Optimize for speed over quality | Quality is non-negotiable |
| Require constant monitoring | Defeats autonomy goal |
| Build adaptive ML | Over-engineering for now |
| Support all AI providers | Focus on Claude, GPT, Gemini, Ollama |

---

## CEO's Prioritization

1. **Autonomy** (can work without me)
2. **Reliability** (doesn't break things)
3. **Cost control** (stays in budget)
4. **Learning** (improves over time)
5. **Desktop UI** (convenience)

---

## Quotes from CEO

> "Chúng ta có thể tổ chức được workflow chạy liên tục và song song nhiều agents khi cho phép"

> "Endiorbot có thể tự học hỏi, tự sửa lỗi và raise lên CEO hay human coach khi cần thiết"

> "Càng ngày càng thông minh và tự động hoá cao hơn"

> "Khi qua đêm chúng ta có thể dùng các model LLM rẻ tiền hơn hoặc Ollama nhưng chất lượng code cuối cùng vẫn tốt"

> "CEO muốn dùng công cụ của chính mình luôn, nếu đủ tốt không cần mở VSC ra nữa"

---

*CEO Requirements v1.0.0*
*SDLC Framework 6.1.1*
