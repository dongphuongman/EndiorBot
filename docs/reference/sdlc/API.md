# SDLC API Documentation

Programmatic API for EndiorBot's SDLC multi-agent orchestration system.

## Module Overview

```typescript
import {
  // Types
  type AgentRole,
  type SE4ARole,
  type SE4HRole,
  type SdlcTier,
  type TeamConfig,
  type GateType,

  // Role utilities
  isSE4ARole,
  isSE4HRole,
  isValidRole,
  getRoleDefinition,

  // Team utilities
  createTeamConfig,
  isValidArchetype,
  getRecommendedTeams,
  validateTeamsForTier,

  // Gate utilities
  GATE_DEFINITIONS,
  getProposersForGate,
  getApproversForGate,

  // Workflow utilities
  buildDelegationChain,
  getNextAgent,
  getEscalationPath,
} from "@endiorbot/sdlc";
```

## Types

### AgentRole

Union type of all valid agent roles:

```typescript
type SE4ARole =
  | "researcher" | "pm" | "pjm" | "architect"
  | "coder" | "reviewer" | "tester" | "devops";

type SE4HRole = "ceo" | "cpo" | "cto";

type RouterRole = "assistant";

type AgentRole = SE4ARole | SE4HRole | RouterRole;
```

### SdlcTier

Project complexity tier:

```typescript
type SdlcTier = "LITE" | "STANDARD" | "PROFESSIONAL" | "ENTERPRISE";
```

### TeamConfig

Team configuration:

```typescript
interface TeamConfig {
  id: string;
  archetype: TeamArchetype;
  name: string;
  leader: string;
  members: string[];
  stages: string[];
  gates: string[];
}

type TeamArchetype = "planning" | "dev" | "qa" | "fullstack" | "executive";
```

### GateType

Quality gate identifiers:

```typescript
type GateType =
  | "G0.1" | "G0.2" | "G1" | "G2" | "G3" | "G4"
  | "G-Sprint" | "G-Sprint-Close";
```

## Role Functions

### isSE4ARole(role)

Check if a role is an SE4A executor:

```typescript
function isSE4ARole(role: AgentRole): role is SE4ARole;

// Example
isSE4ARole("coder"); // true
isSE4ARole("cto");   // false
```

### isSE4HRole(role)

Check if a role is an SE4H advisor:

```typescript
function isSE4HRole(role: AgentRole): role is SE4HRole;

// Example
isSE4HRole("cto");   // true
isSE4HRole("coder"); // false
```

### isValidRole(role)

Check if a string is a valid role:

```typescript
function isValidRole(role: string): role is AgentRole;

// Example
isValidRole("coder");   // true
isValidRole("invalid"); // false
```

### getRoleDefinition(role)

Get full definition for a role:

```typescript
function getRoleDefinition(role: AgentRole): RoleDefinition;

interface RoleDefinition {
  role: AgentRole;
  category: "executor" | "advisor" | "router";
  name: string;
  description: string;
  stages: string[];
  gates: string[];
  tools: { allowed: string[]; denied: string[] };
  defaultModel: string;
}

// Example
const def = getRoleDefinition("coder");
// {
//   role: "coder",
//   category: "executor",
//   name: "Developer",
//   stages: ["04"],
//   gates: ["G-Sprint"],
//   ...
// }
```

## Team Functions

### createTeamConfig(id, archetype, overrides?)

Create a team configuration:

```typescript
function createTeamConfig(
  id: string,
  archetype: TeamArchetype,
  overrides?: Partial<TeamConfig>
): TeamConfig;

// Example
const devTeam = createTeamConfig("dev", "dev");
// {
//   id: "dev",
//   archetype: "dev",
//   name: "Development Team",
//   leader: "coder",
//   members: ["coder", "reviewer"],
//   stages: ["04", "05"],
//   gates: ["G-Sprint", "G3"]
// }

// With overrides
const customTeam = createTeamConfig("custom", "dev", {
  name: "Custom Dev Team",
  members: ["coder", "reviewer", "tester"]
});
```

### isValidArchetype(archetype)

Check if a string is a valid team archetype:

```typescript
function isValidArchetype(archetype: string): archetype is TeamArchetype;

// Example
isValidArchetype("dev");     // true
isValidArchetype("invalid"); // false
```

### getRecommendedTeams(tier)

Get recommended team archetypes for a tier:

```typescript
function getRecommendedTeams(tier: SdlcTier): string[];

// Examples
getRecommendedTeams("LITE");       // ["dev"]
getRecommendedTeams("STANDARD");   // ["dev", "planning"]
getRecommendedTeams("ENTERPRISE"); // ["dev", "planning", "qa", "executive"]
```

### validateTeamsForTier(teams, tier)

Validate team configuration against tier requirements:

```typescript
function validateTeamsForTier(
  teams: Record<string, TeamConfig>,
  tier: SdlcTier
): {
  valid: boolean;
  missing: string[];
  warnings: string[];
};

// Example
const result = validateTeamsForTier({ dev: devTeam }, "STANDARD");
// { valid: false, missing: ["planning"], warnings: [] }
```

## Gate Functions

### GATE_DEFINITIONS

Record of all gate definitions:

```typescript
const GATE_DEFINITIONS: Record<GateType, GateDefinition>;

interface GateDefinition {
  gate: GateType;
  name: string;
  description: string;
  stage: string;
  proposedBy: AgentRole[];
  approvedBy: AgentRole[];
  evidenceRequired: string[];
  dependencies: GateType[];
}

// Example
const g3 = GATE_DEFINITIONS["G3"];
// {
//   gate: "G3",
//   name: "Ship Ready",
//   stage: "05",
//   proposedBy: ["reviewer", "tester"],
//   approvedBy: ["cto"],
//   ...
// }
```

### getProposersForGate(gate)

Get roles that can propose a gate:

```typescript
function getProposersForGate(gate: GateType): AgentRole[];

// Example
getProposersForGate("G3"); // ["reviewer", "tester"]
```

### getApproversForGate(gate)

Get roles that can approve a gate:

```typescript
function getApproversForGate(gate: GateType): AgentRole[];

// Example
getApproversForGate("G3"); // ["cto"]
```

### getTeamForGate(gate, teams)

Find which team handles a gate:

```typescript
function getTeamForGate(
  gate: GateType,
  teams: Record<string, TeamConfig>
): TeamConfig | null;

// Example
const team = getTeamForGate("G-Sprint", { dev: devTeam });
// devTeam (because dev team handles G-Sprint)
```

## Workflow Functions

### buildDelegationChain(taskType)

Get the delegation chain for a task type:

```typescript
function buildDelegationChain(
  taskType: "research" | "implement" | "deploy" | "review"
): AgentRole[];

// Examples
buildDelegationChain("research");  // ["researcher", "pm"]
buildDelegationChain("implement"); // ["coder", "reviewer"]
buildDelegationChain("deploy");    // ["devops", "cto"]
```

### getNextAgent(currentRole, workflowType)

Get next agent in a workflow:

```typescript
function getNextAgent(
  currentRole: AgentRole,
  workflowType: "development" | "planning"
): AgentRole | null;

// Examples
getNextAgent("coder", "development");    // "reviewer"
getNextAgent("reviewer", "development"); // "tester"
getNextAgent("devops", "development");   // null (end of chain)
```

### getEscalationPath(role)

Get escalation path for a role:

```typescript
function getEscalationPath(role: AgentRole): AgentRole[];

// Examples
getEscalationPath("coder");     // ["reviewer", "architect", "cto"]
getEscalationPath("pm");        // ["cpo"]
getEscalationPath("architect"); // ["cto"]
```

### createFeatureWorkflow(tier)

Create a feature workflow for a tier:

```typescript
function createFeatureWorkflow(tier: SdlcTier): WorkflowStep[];

interface WorkflowStep {
  role: AgentRole;
  status: "pending" | "in_progress" | "completed";
}

// Example
const workflow = createFeatureWorkflow("LITE");
// [
//   { role: "coder", status: "pending" },
//   { role: "reviewer", status: "pending" }
// ]
```

### getCurrentWorkflowStep(workflow)

Get current step in a workflow:

```typescript
function getCurrentWorkflowStep(workflow: WorkflowStep[]): WorkflowStep | null;

// Returns in_progress step, or first pending step, or null if all complete
```

### getWorkflowProgress(workflow)

Get workflow completion percentage:

```typescript
function getWorkflowProgress(workflow: WorkflowStep[]): number;

// Returns 0-100 based on completed steps
```

## CLI Commands

### sdlc agents list

List configured SDLC agents:

```bash
endiorbot sdlc agents list [--role <role>] [--json]
```

### sdlc agents add

Show how to add an SDLC agent:

```bash
endiorbot sdlc agents add <id> --role <role> [--model <model>] [--workspace <path>] [--json]
```

### sdlc teams list

List configured teams:

```bash
endiorbot sdlc teams list [--json]
```

### sdlc queue status

Show message queue status:

```bash
endiorbot sdlc queue status [--agent <id>] [--json]
```

### sdlc gates status

Show gate status:

```bash
endiorbot sdlc gates status [--gate <gate>] [--json]
```

### sdlc gates propose

Propose a gate for approval:

```bash
endiorbot sdlc gates propose <gate> [--evidence <path>] [--json]
```

## Error Handling

Most functions return null or empty arrays for invalid inputs:

```typescript
getRoleDefinition("invalid");     // undefined
getTeamForGate("G99", teams);     // null
getEscalationPath("ceo");         // [] (no escalation for top roles)
```

Validation functions return structured results:

```typescript
const result = validateTeamConfig(config);
if (!result.valid) {
  console.error(result.errors);
  console.warn(result.warnings);
}
```

## Best Practices

1. **Check role types before operations**:
   ```typescript
   if (isSE4HRole(role)) {
     // Can approve gates
   } else if (isSE4ARole(role)) {
     // Can execute work
   }
   ```

2. **Use tier-appropriate teams**:
   ```typescript
   const recommended = getRecommendedTeams(tier);
   const validation = validateTeamsForTier(teams, tier);
   ```

3. **Follow escalation paths**:
   ```typescript
   const escalation = getEscalationPath("coder");
   // ["reviewer", "architect", "cto"]
   ```

4. **Track workflow progress**:
   ```typescript
   const workflow = createFeatureWorkflow("STANDARD");
   const current = getCurrentWorkflowStep(workflow);
   const progress = getWorkflowProgress(workflow);
   ```
