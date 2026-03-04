/**
 * Compliance Fix Types
 *
 * Types, constants, and mappings for the compliance fix engine.
 * Maps SDLC stages to responsible agents, defines processing order,
 * and provides cross-stage context types.
 *
 * @module sdlc/compliance/fix-types
 * @version 1.0.0
 * @date 2026-03-03
 * @status ACTIVE - Sprint 75
 * @authority ADR-018 AI-Generated Compliance Content
 * @sprint 75
 */

import type { AgentRole } from "../../agents/types/handoff.js";
import type { ContentIssue, StageContentResult } from "./content-checker.js";
import type { ProjectTier } from "../scaffold/types.js";

// ============================================================================
// Constants
// ============================================================================

/** W4: Max file size for AI-generated content (50KB) */
export const MAX_GENERATED_FILE_SIZE = 50 * 1024;

// ============================================================================
// Stage → Agent Mapping
// ============================================================================

/**
 * Maps SDLC stages (lowercase) to the responsible agent role.
 * Used by the compliance fix engine to determine which agent
 * generates content for each stage.
 */
export const STAGE_AGENT_MAP: Record<string, AgentRole> = {
  "00-foundation": "pm",
  "01-planning": "pm",
  "02-design": "architect",
  "03-integrate": "architect",
  "04-build": "pjm",
  "05-test": "tester",
  "06-deploy": "devops",
  "07-operate": "devops",
  "08-collaborate": "pm",
  "09-govern": "pm",
  "10-archive": "pm",
};

/**
 * Tier-aware fallback agents when the primary agent is unavailable.
 * E.g., @tester is only available in PROFESSIONAL+ — STANDARD uses @reviewer.
 */
export const STAGE_AGENT_FALLBACK: Partial<Record<string, Partial<Record<ProjectTier, AgentRole>>>> = {
  "05-test": { LITE: "fullstack", STANDARD: "reviewer" },
};

// ============================================================================
// Stage Processing Order
// ============================================================================

/**
 * Stage processing order — ensures cross-stage dependencies.
 * Compliance fix processes stages sequentially in this order,
 * feeding each stage's output as context to subsequent stages.
 */
export const STAGE_PROCESSING_ORDER: string[] = [
  "00-foundation",
  "01-planning",
  "02-design",
  "03-integrate",
  "04-build",
  "05-test",
  "06-deploy",
  "07-operate",
  "08-collaborate",
  "09-govern",
  "10-archive",
];

// ============================================================================
// Stage → Gate Mapping (Dual-Track per SDLC 6.1.1)
// ============================================================================

/**
 * Maps stages to their applicable gates.
 * Feature gates: G0→G4, Sprint gates: G-Sprint, G-Sprint-Close.
 */
export const STAGE_GATE_MAP: Record<string, string[]> = {
  "00-foundation": ["G0"],
  "01-planning": ["G0.1", "G1"],
  "02-design": ["G2"],
  "04-build": ["G-Sprint", "G-Sprint-Close"],
  "05-test": ["G3"],
  "06-deploy": ["G4"],
};

// ============================================================================
// Agent → Skill Mapping
// ============================================================================

/**
 * Maps agents to skills that should be injected into their prompts.
 * Currently only @tester has the e2e-api-testing skill.
 */
export const AGENT_SKILL_MAP: Partial<Record<AgentRole, string[]>> = {
  tester: ["e2e-api-testing"],
};

// ============================================================================
// Document Hierarchy
// ============================================================================

/**
 * SDLC 6.1.1 document hierarchy levels.
 * Roadmap → Phases → Sprints → Backlog (4 levels).
 */
export type DocHierarchyLevel = "roadmap" | "phase" | "sprint" | "backlog" | "gate";

// ============================================================================
// normalizeStageKey — Bridge UPPERCASE contracts ↔ lowercase content-checker
// ============================================================================

/**
 * Normalize a stage key to lowercase for cross-map lookups.
 * Contracts use UPPERCASE ("00-FOUNDATION"), content-checker uses lowercase ("00-foundation").
 * This bridges the gap without codebase-wide casing migration (CTO C2).
 */
export function normalizeStageKey(stageKey: string): string {
  return stageKey.toLowerCase();
}

// ============================================================================
// Project Snapshot Types
// ============================================================================

/**
 * Tech stack information detected from project files.
 */
export interface TechStackInfo {
  /** Primary language (e.g., "TypeScript", "Python") */
  language: string;
  /** Framework (e.g., "Express", "Next.js") */
  framework?: string;
  /** Package manager (e.g., "pnpm", "npm", "yarn") */
  packageManager?: string;
  /** Has TypeScript config */
  hasTypeScript: boolean;
  /** Has Docker */
  hasDocker: boolean;
  /** Has CI/CD */
  hasCI: boolean;
  /** Dependencies list (top-level) */
  dependencies: string[];
  /** Dev dependencies list (top-level) */
  devDependencies: string[];
  /** Scripts from package.json */
  scripts: Record<string, string>;
}

/**
 * Code module detected in the project.
 */
export interface CodeModule {
  /** Module name (directory name) */
  name: string;
  /** Relative path from project root */
  path: string;
  /** Number of source files */
  fileCount: number;
  /** Key file names in the module */
  keyFiles: string[];
}

/**
 * Test file information.
 */
export interface TestFileInfo {
  /** Relative path from project root */
  path: string;
  /** Test type classification */
  type: "unit" | "integration" | "e2e" | "manual" | "unknown";
  /** File name */
  name: string;
}

/**
 * Existing documentation information.
 */
export interface ExistingDocInfo {
  /** Stage the doc belongs to */
  stage: string;
  /** Relative path from stage directory */
  path: string;
  /** Number of content lines */
  contentLines: number;
  /** Number of placeholders found */
  placeholderCount: number;
  /** Whether this doc has real (non-placeholder) content */
  hasRealContent: boolean;
}

/**
 * Complete project snapshot — context collected from the target project.
 * Fed into agent prompts for context-aware content generation.
 */
export interface ProjectSnapshot {
  /** Project name */
  name: string;
  /** Project description */
  description: string;
  /** Project tier */
  tier: ProjectTier;
  /** Detected tech stack */
  techStack: TechStackInfo;
  /** Code modules discovered */
  codeModules: CodeModule[];
  /** Test files discovered */
  testFiles: TestFileInfo[];
  /** Existing documentation */
  existingDocs: ExistingDocInfo[];
  /** Project root path */
  projectPath: string;
}

// ============================================================================
// Fix Action Types
// ============================================================================

/**
 * Single fix action — one file to create or update.
 */
export interface FixAction {
  /** Target file path (relative to project root) */
  targetPath: string;
  /** Stage this action belongs to */
  stage: string;
  /** What artifact this generates */
  artifactType: string;
  /** Description of what to generate */
  description: string;
  /** Hierarchy level in SDLC 6.1.1 doc structure */
  hierarchyLevel?: DocHierarchyLevel;
}

/**
 * Agent fix task — groups fix actions by stage and agent.
 */
export interface AgentFixTask {
  /** Stage (lowercase) */
  stage: string;
  /** Agent responsible */
  agent: AgentRole;
  /** Actions to perform */
  actions: FixAction[];
  /** Issues this task addresses */
  issues: ContentIssue[];
  /** Applicable gates */
  gates: string[];
  /** Prompt context: tech stack, code modules, etc. */
  promptContext: string;
}

// ============================================================================
// Result Types
// ============================================================================

/**
 * Result of a single fix action.
 */
export interface FixActionResult {
  /** The action that was performed */
  action: FixAction;
  /** Whether the action succeeded */
  success: boolean;
  /** Generated content (if successful) */
  content?: string;
  /** Error message (if failed) */
  error?: string;
  /** Whether this was a dry-run preview */
  dryRun: boolean;
}

/**
 * Result of processing all actions for one agent task.
 */
export interface AgentTaskResult {
  /** The task that was processed */
  task: AgentFixTask;
  /** Results for each action */
  actionResults: FixActionResult[];
  /** Overall success (all actions succeeded) */
  success: boolean;
  /** Duration in ms */
  durationMs: number;
}

/**
 * Overall compliance fix result.
 */
export interface ComplianceFixResult {
  /** L2 score before fix */
  scoreBefore: number;
  /** L2 score after fix */
  scoreAfter: number;
  /** Total issues found */
  totalIssues: number;
  /** Issues fixed */
  issuesFixed: number;
  /** Issues failed to fix */
  issuesFailed: number;
  /** Per-task results */
  taskResults: AgentTaskResult[];
  /** Stage results before */
  stageResultsBefore: StageContentResult[];
  /** Stage results after */
  stageResultsAfter: StageContentResult[];
  /** Total duration in ms */
  durationMs: number;
  /** Patch ID for rollback */
  patchId?: string;
  /** Whether this was a dry-run */
  dryRun: boolean;
}

// ============================================================================
// Configuration
// ============================================================================

/**
 * Compliance fix engine configuration.
 */
export interface ComplianceFixConfig {
  /** Target project path */
  projectPath: string;
  /** Project tier */
  tier: ProjectTier;
  /** Dry-run mode (preview only) */
  dryRun: boolean;
  /** Auto-confirm all patches (--yes flag) */
  autoConfirm: boolean;
  /** Fix specific stage only */
  stage?: string;
  /** Stages to process (from tier) */
  stages: string[];
}

/**
 * Content generator configuration.
 */
export interface GeneratorConfig {
  /** Project path */
  projectPath: string;
  /** Project tier */
  tier: ProjectTier;
  /** Dry-run mode */
  dryRun: boolean;
  /** Auto-confirm patches */
  autoConfirm: boolean;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Get the agent responsible for a stage, with tier-aware fallback.
 */
export function getAgentForStage(stage: string, tier: ProjectTier): AgentRole {
  const fallbacks = STAGE_AGENT_FALLBACK[stage];
  if (fallbacks) {
    const fallback = fallbacks[tier];
    if (fallback) return fallback;
  }
  return STAGE_AGENT_MAP[stage] ?? "pm";
}
