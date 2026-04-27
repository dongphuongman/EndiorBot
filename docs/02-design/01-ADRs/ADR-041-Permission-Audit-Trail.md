# ADR-041: Permission Audit Trail + Decision Logging

**Status:** PROPOSED
**Date:** 2026-04-01
**Sprint:** 125
**Authority:** PM + Architect
**SDLC Framework:** 6.3.0
**Traces:** ADR-039 (research findings), Sprint 122 (agentGuidance)

---

## Context

EndiorBot's RiskClassifier evaluates tool risk (LOW/MEDIUM/HIGH/CRITICAL) and returns confirmation type (auto/explicit/explicit_with_audit). But it does NOT log:
- **Why** a decision was made (which rule triggered)
- **Who** approved (CEO, auto-rule, hook)
- **When** (timestamp for audit trail)
- **What happened after** (tool succeeded or failed)

For Solo Developer Power Tool operating with increasing autonomy (Sprint 124+), audit trail is essential for:
- Debugging: "why was this tool allowed/blocked?"
- Compliance: SDLC gate evidence for G3/G4
- Trust building: demonstrate safe autonomy to CEO before granting Gate C

**Research source:** Permission decision tracking pattern observed in clean-room specs (ADR-039 compliant). Independently designed for EndiorBot's architecture.

---

## Decision

### Add decision reason to every permission check

```typescript
interface PermissionDecision {
  tool: string;
  decision: "allow" | "deny" | "confirm";
  reason: PermissionDecisionReason;
  riskLevel: RiskLevel;
  timestamp: string;
  agent?: string;
  sessionId?: string;
}

type PermissionDecisionReason =
  | { type: "rule"; rule: string }         // Matched a configured rule
  | { type: "risk-level"; level: string }  // RiskClassifier determination
  | { type: "hook"; hookName: string }     // PreToolUse hook decided
  | { type: "user"; action: string }       // CEO manually approved/denied
  | { type: "auto"; reason: string };      // Auto-approved (read-only, etc.)
```

### Append-only audit log

Store at `~/.endiorbot/audit/permissions.jsonl` — one JSON line per decision:

```jsonl
{"tool":"Bash","decision":"allow","reason":{"type":"risk-level","level":"LOW"},"riskLevel":"LOW","timestamp":"2026-04-01T10:00:00Z","agent":"coder"}
{"tool":"Edit","decision":"confirm","reason":{"type":"risk-level","level":"MEDIUM"},"riskLevel":"MEDIUM","timestamp":"2026-04-01T10:00:05Z","agent":"coder"}
```

### OTT command: `/audit permissions` (Sprint 125 only — no generic `/audit`)

**Contract:** Only `/audit permissions [--limit N]` in Sprint 125. No `/audit sessions`, `/audit tokens`, etc. until taxonomy defined.

```
/audit permissions
→ Last 10 permission decisions:
  1. ✅ Bash (LOW) — auto: read-only command — 10:00:00
  2. ⚠️ Edit (MEDIUM) — risk-level: MEDIUM, confirmed by CEO — 10:00:05
  3. ❌ rm -rf (CRITICAL) — risk-level: CRITICAL, blocked — 10:00:10
```

---

## Consequences

### Positive
- Full traceability of every permission decision
- CEO can audit autonomous sessions after the fact
- Foundation for Gate C (true autonomy) — demonstrate safety through evidence
- Compliance: SDLC gate G3/G4 evidence artifact

### Negative
- ~1ms overhead per permission check (JSONL append)
- Disk growth: ~100 bytes/decision × 1000 decisions/day = ~100KB/day

### Retention / Rotation Policy
- **Max file size:** 5MB per `permissions.jsonl` (~50K entries)
- **Rotation:** When exceeding 5MB, rename to `permissions-{YYYY-MM}.jsonl.bak`, start fresh
- **Archive retention:** 3 months (older `.bak` files auto-deleted on next rotation)
- **Implementation:** Check size on append; rotate if exceeded

### Risks
- Audit log could contain sensitive command content (e.g., `Bash: cat .env`)
- Mitigation: log tool name + decision only, NOT full command content. Scrub via output-redactor if tool args are included.

---

## Files to Modify

| Action | File | Change |
|--------|------|--------|
| MODIFY | `src/agents/safety/risk-classifier.ts` | Add `decisionReason` to `RiskClassification` result |
| CREATE | `src/security/permission-audit.ts` | JSONL audit logger (append-only) |
| MODIFY | `src/commands/index.ts` | Register `/audit` OTT command |
| CREATE | `src/commands/handlers/audit-commands.ts` | Handler for `/audit permissions` |

---

## References

- ADR-039: Research artifacts governance (pattern source)
- Sprint 122: `agentGuidance` field — similar "actionable metadata" pattern
- RiskClassifier: `src/agents/safety/risk-classifier.ts` — existing 4-tier system
