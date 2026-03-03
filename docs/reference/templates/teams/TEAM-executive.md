---
team: executive
archetype: executive
version: 1.0.0
created: 2026-03-03
---

# TEAM Charter - Executive Team

## Mission

**Advisory and governance** across the entire SDLC. Set strategic direction, enforce quality standards, and approve critical gates. Executives advise — they do not execute.

## Coverage

| SDLC Stage | Responsibility |
|------------|---------------|
| All stages | Advisory, gate approvals, strategic direction |

## Leader

- **ENTERPRISE tier:** **@ceo** — Strategic authority. Ultimate decision-maker for enterprise governance.
- **PROFESSIONAL tier:** **@cto** — Technical authority. Coordinates executive input on architecture, quality, and technology decisions.

## Members

| Role | Responsibility | When Active |
|------|---------------|-------------|
| @ceo | Strategic direction, G0.1 and G4 approval | Gate reviews |
| @cpo | Product vision, G0.1 and G1 approval | Planning reviews |
| @cto | Technical standards, G2 and G3 approval | Design and quality reviews |

## Gates

| Gate | Stage | Approver | Criteria |
|------|-------|----------|----------|
| G0.1 | 00 | @ceo, @cpo | Problem validated, aligned with strategy |
| G1 | 01 | @cpo | Requirements complete, product-market fit |
| G2 | 02 | @cto | Architecture sound, standards met |
| G3 | 05 | @cto | Quality verified, production ready |
| G4 | 06 | @ceo | Business approval for production release |

## Workflow

```
1. Teams propose gate completions
2. Executive team reviews and approves/rejects
3. If rejected: provide specific feedback for remediation
4. If approved: team proceeds to next stage
```

## Delegation Rules

The **@cto** (leader) coordinates executive reviews:

- `[@ceo: G0.1 review needed — problem statement ready for strategic alignment check]`
- `[@cpo: G1 review needed — requirements ready for product vision alignment]`

Executives can direct any operational team:
- `[@planning: Strategic priority change — reprioritize <feature>]`
- `[@dev: Technical standards update — adopt <pattern> per ADR-XXX]`
- `[@qa: Quality bar increase — coverage must reach <X>% for <component>]`
- `[@ops: Production readiness review — verify <deployment criteria>]`

## Policies

### Advisory Only
Executives set direction and approve gates. They do NOT:
- Write code
- Execute deployments
- Run tests
- Create design documents

### Gate Approval Authority
Each executive has specific gate authority (see table above). No executive can approve gates outside their domain.

### Escalation Path
When operational teams cannot resolve issues:
```
Operational team → @pjm → Executive team
```

Direct escalation to executives is reserved for:
- Security incidents (P0)
- Production outages
- Strategic misalignment
- Budget/timeline concerns

## Tier Availability

| Tier | Available |
|------|-----------|
| LITE | No |
| STANDARD | No (SE4H agents available individually) |
| PROFESSIONAL | Yes |
| ENTERPRISE | Yes |
