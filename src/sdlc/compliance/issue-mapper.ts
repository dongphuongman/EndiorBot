/**
 * Issue Mapper
 *
 * Maps compliance issues (ContentIssue[]) to agent fix tasks (AgentFixTask[]).
 * Groups issues by stage, assigns responsible agents, builds prompt context
 * with tech stack, gates, and hierarchy information.
 *
 * @module sdlc/compliance/issue-mapper
 * @version 1.0.0
 * @date 2026-03-03
 * @status ACTIVE - Sprint 75
 * @authority ADR-018 AI-Generated Compliance Content
 * @sprint 75
 */

import type { ContentIssue, StageContentResult } from "./content-checker.js";
import { STAGE_CONTENT_REQUIREMENTS } from "./content-checker.js";
import type { AgentFixTask, FixAction, ProjectSnapshot } from "./fix-types.js";
import {
  getAgentForStage,
  normalizeStageKey,
  STAGE_GATE_MAP,
  STAGE_PROCESSING_ORDER,
} from "./fix-types.js";
import { TIER_STAGES } from "../scaffold/types.js";

// ============================================================================
// Public API
// ============================================================================

/**
 * Map compliance issues to agent fix tasks.
 *
 * Groups issues by stage, assigns agents, builds prompt context,
 * and sorts by STAGE_PROCESSING_ORDER for sequential processing.
 *
 * @param issues - Content issues from L2 compliance check
 * @param stageResults - Per-stage content results
 * @param snapshot - Project context snapshot
 * @returns Sorted array of agent fix tasks
 */
export function mapIssuesToFixTasks(
  issues: ContentIssue[],
  stageResults: StageContentResult[],
  snapshot: ProjectSnapshot,
): AgentFixTask[] {
  // W3: Validate stages against tier whitelist
  const validStages = new Set(TIER_STAGES[snapshot.tier]);

  // Group issues by stage
  const issuesByStage = new Map<string, ContentIssue[]>();
  for (const issue of issues) {
    if (!issue.stage) continue;
    // P0-2: Normalize stage key to handle UPPERCASE from contracts
    const stage = normalizeStageKey(issue.stage);
    if (!validStages.has(stage)) continue; // W3: skip invalid stages

    const existing = issuesByStage.get(stage) ?? [];
    existing.push(issue);
    issuesByStage.set(stage, existing);
  }

  // Build tasks for each stage with issues
  const tasks: AgentFixTask[] = [];

  for (const [stage, stageIssues] of issuesByStage) {
    const agent = getAgentForStage(stage, snapshot.tier);
    const stageResult = stageResults.find((r) => r.stage === stage);
    const actions = buildFixActions(stage, stageIssues, stageResult);

    if (actions.length === 0) continue;

    const gates = STAGE_GATE_MAP[stage] ?? [];
    const promptContext = buildPromptContext(stage, snapshot, gates);

    tasks.push({
      stage,
      agent,
      actions,
      issues: stageIssues,
      gates,
      promptContext,
    });
  }

  // Sort by processing order
  tasks.sort((a, b) => {
    const aIdx = STAGE_PROCESSING_ORDER.indexOf(a.stage);
    const bIdx = STAGE_PROCESSING_ORDER.indexOf(b.stage);
    return aIdx - bIdx;
  });

  return tasks;
}

// ============================================================================
// Fix Action Builder
// ============================================================================

function buildFixActions(
  stage: string,
  issues: ContentIssue[],
  stageResult: StageContentResult | undefined,
): FixAction[] {
  const actions: FixAction[] = [];
  const requirements = STAGE_CONTENT_REQUIREMENTS[stage];

  // Handle missing artifacts
  const missingArtifacts = issues.filter((i) => i.type === "missing_artifact");
  for (const issue of missingArtifacts) {
    if (!issue.file) continue;
    const isSubdir = issue.file.endsWith("/");

    if (!isSubdir) {
      actions.push({
        targetPath: `docs/${stage}/${issue.file}`,
        stage,
        artifactType: issue.file,
        description: `Generate ${issue.file} for stage ${stage}`,
      });
    }
  }

  // Handle placeholder content — need to regenerate files with real content
  const placeholderIssues = issues.filter((i) => i.type === "placeholder");
  if (placeholderIssues.length > 0 && stageResult) {
    // For stages with placeholder content, generate replacement content
    // Target files that have placeholders
    for (const found of stageResult.artifactsFound) {
      if (found.endsWith("/")) continue; // Skip subdirs
      const path = `docs/${stage}/${found}`;
      // Only add if not already in actions
      if (!actions.some((a) => a.targetPath === path)) {
        actions.push({
          targetPath: path,
          stage,
          artifactType: found,
          description: `Replace placeholder content in ${found} with real content`,
        });
      }
    }
  }

  // Handle insufficient content — also regenerate
  const insufficientIssues = issues.filter((i) => i.type === "insufficient_content");
  if (insufficientIssues.length > 0 && requirements) {
    // Generate required artifacts that don't exist yet
    for (const artifact of requirements.requiredArtifacts) {
      const path = `docs/${stage}/${artifact}`;
      if (!actions.some((a) => a.targetPath === path)) {
        actions.push({
          targetPath: path,
          stage,
          artifactType: artifact,
          description: `Generate ${artifact} with sufficient content for stage ${stage}`,
        });
      }
    }
  }

  return actions;
}

// ============================================================================
// Prompt Context Builder
// ============================================================================

function buildPromptContext(
  stage: string,
  snapshot: ProjectSnapshot,
  gates: string[],
): string {
  const lines: string[] = [];

  // Project overview
  lines.push(`## Project Context`);
  lines.push(`- **Project:** ${snapshot.name}`);
  if (snapshot.description) {
    lines.push(`- **Description:** ${snapshot.description}`);
  }
  lines.push(`- **Tier:** ${snapshot.tier}`);
  lines.push(`- **Stage:** ${stage}`);
  lines.push("");

  // Tech stack
  lines.push(`## Tech Stack`);
  lines.push(`- **Language:** ${snapshot.techStack.language}`);
  if (snapshot.techStack.framework) {
    lines.push(`- **Framework:** ${snapshot.techStack.framework}`);
  }
  if (snapshot.techStack.packageManager) {
    lines.push(`- **Package Manager:** ${snapshot.techStack.packageManager}`);
  }
  if (snapshot.techStack.hasDocker) lines.push(`- **Docker:** Yes`);
  if (snapshot.techStack.hasCI) lines.push(`- **CI/CD:** Yes`);
  lines.push("");

  // Code modules
  if (snapshot.codeModules.length > 0) {
    lines.push(`## Code Modules`);
    for (const mod of snapshot.codeModules.slice(0, 10)) {
      lines.push(`- \`${mod.path}/\` — ${mod.fileCount} files (${mod.keyFiles.slice(0, 3).join(", ")})`);
    }
    lines.push("");
  }

  // Test summary
  if (snapshot.testFiles.length > 0) {
    const unitCount = snapshot.testFiles.filter((t) => t.type === "unit").length;
    const e2eCount = snapshot.testFiles.filter((t) => t.type === "e2e").length;
    const integCount = snapshot.testFiles.filter((t) => t.type === "integration").length;

    lines.push(`## Test Summary`);
    lines.push(`- **Total test files:** ${snapshot.testFiles.length}`);
    if (unitCount > 0) lines.push(`- **Unit tests:** ${unitCount}`);
    if (integCount > 0) lines.push(`- **Integration tests:** ${integCount}`);
    if (e2eCount > 0) lines.push(`- **E2E tests:** ${e2eCount}`);
    lines.push("");
  }

  // Gate info
  if (gates.length > 0) {
    lines.push(`## Quality Gates`);
    lines.push(`This stage is associated with gates: ${gates.join(", ")}`);
    lines.push(`Generated documents should reference these gates in a "Quality Gates" section.`);
    lines.push("");
  }

  // Dependencies (top 10)
  if (snapshot.techStack.dependencies.length > 0) {
    lines.push(`## Key Dependencies`);
    for (const dep of snapshot.techStack.dependencies.slice(0, 10)) {
      lines.push(`- ${dep}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
