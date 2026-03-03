# ADR-018: AI-Generated Compliance Content

**Status:** Accepted
**Date:** 2026-03-03
**Author:** Architect
**SDLC Stage:** 02-DESIGN
**Sprint:** 75

---

## Context

EndiorBot detects compliance gaps via `endiorbot compliance check` but cannot fix them. Projects scaffolded with `endiorbot init` have placeholder docs resulting in low L2 Content scores (e.g., dyad project: 14% with 17 issues).

CEO requires an automated fix capability that leverages EndiorBot's agent system (@pm, @architect, @tester, @devops, @pjm) to generate real compliance content for any project.

**CTO Review (v2 → v3):** v2 proposed `invokeRead() + fs.writeFile()` which bypasses PatchValidator and CEO confirmation gate. v3 routes all writes through existing `invokePatch()` pipeline.

---

## Decision

### 1. Route writes through invokePatch()

All file writes go through the existing `invokePatch()` pipeline:
```
invokePatch() → Claude PATCH mode → PatchValidator.validate() → CEO confirm → applyPatch() → disk
```

This retains PatchValidator security checks (dangerous patterns, path traversal, sensitive files) and the CEO confirmation gate. The `--yes` flag enables batch mode auto-confirmation.

### 2. Implement applyPatch()

The private `applyPatch()` method in `ClaudeCodeBridge` (currently a TODO stub) gets a real implementation using `git apply` with fallback to manual file operations.

### 3. No handoff chains

Each stage gets an independent `invokePatch()` call with the appropriate agent's SOUL template. The handoff system (`pm→architect→coder`) is bypassed because compliance fix is a document generation task, not a multi-agent conversation.

### 4. Post-write validation gate

After each file write, content is validated:
- **Quality gate:** `countPlaceholders(content).length === 0`
- **Security:** `scrub()` verifies no sensitive data leaked
- **Size cap:** `MAX_GENERATED_FILE_SIZE = 50KB`

If validation fails, the file is rolled back and the task is marked as failed.

### 5. Sequential stage processing with cross-stage context

Stages are processed in order (00 → 01 → 02 → ...). Each stage's output is fed as context to subsequent stages, ensuring cross-stage document consistency.

### 6. PatchManager audit trail

All changes are tracked via `PatchManager.recordChange()` with SHA256 content hashing, enabling rollback via patch ID.

### 7. Agent skill injection

When invoking @tester for stage 05-test, the `e2e-api-testing` skill (v3.0.0) is injected into the prompt, providing tier-aware coverage targets, OWASP API Security checklist, and evidence artifact structure.

---

## Consequences

### Positive

- Reuses existing PatchValidator + CEO confirmation infrastructure (no security bypass)
- Automated compliance improvement for any project
- Cross-stage consistent docs via sequential processing with context forwarding
- Full audit trail via PatchManager + PatchValidator
- @tester generates SDLC 6.1.1-compliant test plans with OWASP coverage

### Negative

- AI content quality depends on model capability
- Deterministic fallback generates generic (but valid) content when bridge unavailable
- Each file write requires CEO confirmation (mitigated by `--yes` flag for batch mode)

---

## Alternatives Considered

### A. invokeRead() + fs.writeFile() (v2 approach — REJECTED)
Bypasses PatchValidator and CEO confirmation gate. CTO rejected for security reasons.

### B. Team-based compliance fix (Future)
Use @planning, @qa teams instead of individual agents. Deferred — team coordination adds complexity without proportional value for document generation.

---

## References

- Sprint 75 Plan v3 (CTO + CPO approved)
- SDLC Framework 6.1.1 (`.sdlc-framework/02-Core-Methodology/`)
- PatchValidator (`src/agents/invoke/patch-validator.ts`)
- ClaudeCodeBridge (`src/agents/invoke/claude-code-bridge.ts`)
