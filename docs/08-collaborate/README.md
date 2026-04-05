# 08-collaborate — Collaborate

## Purpose

**How to ALIGN humans and agents** — compliance, handover, and shared context so solo-dev + AI work stays auditable and safe.

This stage holds templates, audits, and knowledge transfer supporting stages 00-07. Execution goes through EndiorBot core.

---

## Collaboration Model

EndiorBot is a **personal AI assistant for builders**. It supports solo developers working with AI agents:

```
Developer ←→ EndiorBot (14 SOUL agents)
                │
                ├── @pm, @architect, @coder, @reviewer, @tester
                ├── @fullstack, @devops, @pjm, @researcher
                ├── @ceo, @cto, @cpo, @cso (advisors)
                └── @assistant (router)
```

### How Agents Collaborate

1. **Single agent:** `endiorbot @coder --patch "fix login bug"`
2. **Multi-agent:** `@pm @cto review the auth module` → GoalDecomposer splits → parallel execution
3. **Team mode:** `/launch claude --as-team dev "implement feature"` → dev team (coder + architect + reviewer + tester)

### Advisory Boundary

> EndiorBot output is advisory. In team/enterprise contexts, deliverables should flow through the organization's governance tools where evidence trails and quality gates apply.

---

## OSS Contribution Workflow

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for full details.

```bash
# 1. Fork and clone
git clone https://github.com/<you>/EndiorBot.git

# 2. Install and verify
pnpm install && pnpm build && pnpm test

# 3. Create feature branch
git checkout -b feat/my-feature

# 4. Make changes with tests
# ... code ...

# 5. Verify
pnpm build && pnpm test    # 7,601+ tests must pass

# 6. Submit PR
git push origin feat/my-feature
```

---

## Contents

| Path | Role |
|------|------|
| `01-SDLC-Compliance/` | CLAUDE.md, AGENTS.md compliance copies; gate reports |
| `09-Knowledge-Transfer/` | Architecture overview, ADR summary, codebase map |
| `EXEC_ALLOWLIST.md` | Approved shell execution surfaces (security audit) |
| `LICENSE-AUDIT.md` | Third-party license audit (0 GPL/AGPL) |
| `FINAL-HANDOVER-CEO.md` | Sprint handover artifact |

## License

EndiorBot is [MIT licensed](../../LICENSE). All dependencies are MIT/ISC/Apache/BSD compatible (verified in [LICENSE-AUDIT.md](LICENSE-AUDIT.md)).

---

## Alignment

- **Feeds:** All stages, especially [00-foundation](../00-foundation/) (vision), [02-design](../02-design/) (ADRs)
- **Consumes:** Gate evidence and sprint outcomes from [04-build](../04-build/)
- **Spine:** [stage-command-workflow-spine.md](../00-foundation/stage-command-workflow-spine.md)

---

*EndiorBot | SDLC Framework **6.2.1** — Stage 08: Collaborate*
