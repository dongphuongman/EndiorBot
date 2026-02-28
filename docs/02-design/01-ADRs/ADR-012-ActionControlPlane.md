# ADR-012: ActionControlPlane

| Metadata | Value |
|----------|-------|
| **Status** | Approved |
| **Date** | 2026-02-28 |
| **Authors** | PM, Architect |
| **Reviewers** | CTO, 4-Expert Panel |
| **Sprint** | 54 |
| **Identity** | CEO Power Tool (LOCKED) |

---

## Context

### Problem Statement

Per Master Plan v2.0, every action must go through a Control Plane with the pattern:

```
propose → approve → execute → audit
```

This ensures CEO maintains final authority over all actions while allowing automation for safe operations.

### Master Plan v2.0 Reference

> **Safety (ActionControlPlane)**
> ```typescript
> interface ActionProposal {
>   action: string;
>   risk: 'READ' | 'WRITE' | 'DESTRUCTIVE' | 'MONEY' | 'ADMIN';
>   requiresApproval: boolean;
>   idempotencyKey: string;
> }
> ```

---

## Decision

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                   ActionControlPlane                             │
│                                                                 │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                   1. PROPOSE                             │   │
│   │   • Classify action risk level                          │   │
│   │   • Generate idempotency key                            │   │
│   │   • Check against blocked commands                       │   │
│   └─────────────────────────────────────────────────────────┘   │
│                            │                                    │
│                            ▼                                    │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                   2. EVALUATE                            │   │
│   │                                                          │   │
│   │   READ       → auto-approve                             │   │
│   │   WRITE      → auto-approve (within project)            │   │
│   │   DESTRUCTIVE → require CEO approval                    │   │
│   │   MONEY      → require CEO approval                     │   │
│   │   ADMIN      → require CEO approval                     │   │
│   └─────────────────────────────────────────────────────────┘   │
│                            │                                    │
│              ┌─────────────┴─────────────┐                     │
│              ▼                           ▼                     │
│   ┌─────────────────┐       ┌─────────────────┐                │
│   │  Auto-Approved  │       │ Pending Approval │                │
│   │                 │       │                 │                │
│   │   Execute now   │       │  Notify CEO via │                │
│   │                 │       │  Telegram/CLI   │                │
│   └────────┬────────┘       └────────┬────────┘                │
│            │                         │                          │
│            └────────────┬────────────┘                          │
│                         ▼                                       │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                   3. EXECUTE                             │   │
│   │   • Run approved action                                 │   │
│   │   • Capture result                                      │   │
│   │   • Handle errors                                       │   │
│   └─────────────────────────────────────────────────────────┘   │
│                            │                                    │
│                            ▼                                    │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                   4. AUDIT                               │   │
│   │   • Log action, risk, result                            │   │
│   │   • Store in audit trail                                │   │
│   │   • Notify if needed                                    │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Core Interfaces

```typescript
// Action Proposal
interface ActionProposal {
  id: string;                    // UUID
  action: string;                // e.g., "git push origin main"
  description: string;           // Human-readable
  risk: RiskLevel;
  requiresApproval: boolean;
  idempotencyKey: string;        // For dedup
  createdAt: Date;
  context: {
    project: string;
    file?: string;
    command?: string;
  };
}

// Risk Levels
type RiskLevel = 'READ' | 'WRITE' | 'DESTRUCTIVE' | 'MONEY' | 'ADMIN';

// Risk Classification Rules
const RISK_RULES: Record<RiskLevel, { autoApprove: boolean }> = {
  READ: { autoApprove: true },
  WRITE: { autoApprove: true },  // Within project only
  DESTRUCTIVE: { autoApprove: false },
  MONEY: { autoApprove: false },
  ADMIN: { autoApprove: false },
};

// Blocked Commands (never allow)
const BLOCKED_COMMANDS = [
  'rm -rf',
  'DROP TABLE',
  'git push --force',
  'DELETE FROM',
  'chmod 777',
  'sudo rm',
];

// Action Control Plane Interface
interface ActionControlPlane {
  // Step 1: Propose
  propose(action: string, context: ActionContext): ActionProposal;

  // Step 2: Evaluate
  evaluate(proposal: ActionProposal): 'auto_approve' | 'pending' | 'blocked';

  // Step 3: Execute
  execute(proposal: ActionProposal): Promise<ActionResult>;

  // Step 4: Audit
  audit(proposal: ActionProposal, result: ActionResult): void;

  // CEO Approval
  approve(proposalId: string): Promise<void>;
  reject(proposalId: string, reason: string): Promise<void>;
}

// Action Result
interface ActionResult {
  success: boolean;
  output?: string;
  error?: string;
  duration: number;
  timestamp: Date;
}

// Audit Entry
interface AuditEntry {
  proposalId: string;
  action: string;
  risk: RiskLevel;
  approved: boolean;
  approvedBy: 'auto' | 'ceo';
  result: 'success' | 'failure' | 'blocked';
  timestamp: Date;
}
```

### Risk Classification Algorithm

```typescript
function classifyRisk(action: string, context: ActionContext): RiskLevel {
  // Check for blocked commands first
  for (const blocked of BLOCKED_COMMANDS) {
    if (action.includes(blocked)) {
      throw new Error(`Blocked command: ${blocked}`);
    }
  }

  // Check for DESTRUCTIVE patterns
  const destructivePatterns = [
    /\brm\b/,
    /\bdelete\b/i,
    /\bdrop\b/i,
    /\btruncate\b/i,
    /\breset\s+--hard\b/,
  ];
  if (destructivePatterns.some(p => p.test(action))) {
    return 'DESTRUCTIVE';
  }

  // Check for MONEY patterns
  const moneyPatterns = [
    /\bpayment\b/i,
    /\btransfer\b/i,
    /\bcharge\b/i,
    /\brefund\b/i,
  ];
  if (moneyPatterns.some(p => p.test(action))) {
    return 'MONEY';
  }

  // Check for ADMIN patterns
  const adminPatterns = [
    /\bsudo\b/,
    /\bchown\b/,
    /\bchmod\b/,
    /\badmin\b/i,
    /\broot\b/,
  ];
  if (adminPatterns.some(p => p.test(action))) {
    return 'ADMIN';
  }

  // Check for WRITE patterns
  const writePatterns = [
    /\bwrite\b/i,
    /\bcreate\b/i,
    /\bupdate\b/i,
    /\bgit\s+commit\b/,
    /\bgit\s+push\b/,
    /\bnpm\s+publish\b/,
  ];
  if (writePatterns.some(p => p.test(action))) {
    return 'WRITE';
  }

  // Default to READ
  return 'READ';
}
```

### MVP Stub Implementation

```typescript
// MVP: Simple stub that logs and auto-approves safe actions
class ActionControlPlaneStub implements ActionControlPlane {
  private auditLog: AuditEntry[] = [];

  propose(action: string, context: ActionContext): ActionProposal {
    const risk = classifyRisk(action, context);
    return {
      id: crypto.randomUUID(),
      action,
      description: action.slice(0, 100),
      risk,
      requiresApproval: !RISK_RULES[risk].autoApprove,
      idempotencyKey: this.generateIdempotencyKey(action),
      createdAt: new Date(),
      context,
    };
  }

  evaluate(proposal: ActionProposal): 'auto_approve' | 'pending' | 'blocked' {
    if (BLOCKED_COMMANDS.some(b => proposal.action.includes(b))) {
      return 'blocked';
    }
    return RISK_RULES[proposal.risk].autoApprove ? 'auto_approve' : 'pending';
  }

  async execute(proposal: ActionProposal): Promise<ActionResult> {
    const evaluation = this.evaluate(proposal);

    if (evaluation === 'blocked') {
      throw new Error(`Action blocked: ${proposal.action}`);
    }

    if (evaluation === 'pending') {
      throw new Error(`Action requires CEO approval: ${proposal.action}`);
    }

    // Execute the action (stub: just return success)
    return {
      success: true,
      output: `Executed: ${proposal.action}`,
      duration: 0,
      timestamp: new Date(),
    };
  }

  audit(proposal: ActionProposal, result: ActionResult): void {
    this.auditLog.push({
      proposalId: proposal.id,
      action: proposal.action,
      risk: proposal.risk,
      approved: result.success,
      approvedBy: RISK_RULES[proposal.risk].autoApprove ? 'auto' : 'ceo',
      result: result.success ? 'success' : 'failure',
      timestamp: new Date(),
    });
  }

  private generateIdempotencyKey(action: string): string {
    return crypto.createHash('sha256')
      .update(`${action}-${Date.now()}`)
      .digest('hex')
      .slice(0, 16);
  }
}
```

---

## Consequences

### Positive
- CEO maintains final authority
- Safe operations proceed without friction
- Dangerous operations require explicit approval
- Full audit trail for compliance

### Negative
- Slight delay for approval-required actions
- May block legitimate actions if classification too strict

### Risks
| Risk | Mitigation |
|------|------------|
| Over-blocking | Start lenient, tighten based on incidents |
| Under-blocking | Blocked commands list, pattern matching |
| CEO approval fatigue | Auto-approve safe actions |

---

## Implementation Plan

### Sprint 54 (MVP Stub)

| Task | Hours | Status |
|------|-------|--------|
| Define interfaces | 0.5h | PENDING |
| Implement risk classifier | 0.5h | PENDING |
| Implement stub | 0.5h | PENDING |
| Add audit logging | 0.5h | PENDING |

### Sprint 55+ (Full Implementation)

- CEO approval via Telegram magic link
- Persistent audit log
- Action replay capability

---

## References

- [Master Plan v2.0](../../00-foundation/master-plan.md) - Safety section
- [Sprint 54 Plan](../../04-build/sprints/sprint-54-ai-chat-integration.md)

---

*ADR-012 | CEO Power Tool MVP | ActionControlPlane*
*Identity: LOCKED (2026-02-28)*
*SDLC Framework v6.1.1*
