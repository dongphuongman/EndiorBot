/**
 * Agent Installer — Generate .claude/agents/*.md files for a project.
 *
 * Sprint 84 (CTO MF-1): Enables Strategy A (`claude --agent pm`) by creating
 * all 13 agent files from EndiorBot's SOUL templates + agent metadata.
 *
 * Uses existing .claude/agents/architect.md as the canonical schema reference.
 *
 * @module bridge/intelligence/agent-installer
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { VALID_AGENT_ROLES, type AgentRole } from "./envelope.js";
import { createSoulLoader } from "./soul-loader.js";

// ============================================================================
// Agent Metadata — model + tools + max-turns per role
// ============================================================================

interface AgentMetadata {
  name: string;
  model: string;
  description: string;
  allowedTools: string[];
  maxTurns: number;
}

/**
 * Agent metadata per role.
 * Follows the schema from existing .claude/agents/architect.md.
 */
const AGENT_METADATA: Record<AgentRole, AgentMetadata> = {
  pm: {
    name: "PM",
    model: "sonnet",
    description: "Product Manager — requirements, user stories, sprint planning",
    allowedTools: ["Read", "Grep", "Glob", "WebSearch"],
    maxTurns: 15,
  },
  architect: {
    name: "Architect",
    model: "opus",
    description: "Design decisions, ADRs, technical specifications",
    allowedTools: ["Read", "Grep", "Glob", "WebSearch"],
    maxTurns: 15,
  },
  coder: {
    name: "Coder",
    model: "sonnet",
    description: "Code generation, implementation, refactoring",
    allowedTools: ["Read", "Edit", "Write", "Bash", "Grep", "Glob"],
    maxTurns: 20,
  },
  reviewer: {
    name: "Reviewer",
    model: "sonnet",
    description: "Code review, quality checks, security audit",
    allowedTools: ["Read", "Grep", "Glob", "Bash"],
    maxTurns: 10,
  },
  tester: {
    name: "Tester",
    model: "sonnet",
    description: "Testing strategy, test plans, QA processes",
    allowedTools: ["Read", "Edit", "Write", "Bash", "Grep", "Glob"],
    maxTurns: 15,
  },
  researcher: {
    name: "Researcher",
    model: "sonnet",
    description: "Discovery, research, competitive analysis",
    allowedTools: ["Read", "Grep", "Glob", "WebSearch", "WebFetch"],
    maxTurns: 15,
  },
  devops: {
    name: "DevOps",
    model: "sonnet",
    description: "Deployment, CI/CD, infrastructure, monitoring",
    allowedTools: ["Read", "Edit", "Write", "Bash", "Grep", "Glob"],
    maxTurns: 15,
  },
  fullstack: {
    name: "Fullstack",
    model: "sonnet",
    description: "Full-cycle development from planning to deployment",
    allowedTools: ["Read", "Edit", "Write", "Bash", "Grep", "Glob", "WebSearch"],
    maxTurns: 20,
  },
  pjm: {
    name: "PJM",
    model: "sonnet",
    description: "Sprint coordination, task tracking, timeline management",
    allowedTools: ["Read", "Grep", "Glob"],
    maxTurns: 10,
  },
  ceo: {
    name: "CEO",
    model: "opus",
    description: "Strategic direction, prioritization, executive decisions",
    allowedTools: ["Read", "Grep", "Glob", "WebSearch"],
    maxTurns: 15,
  },
  cpo: {
    name: "CPO",
    model: "sonnet",
    description: "Product vision, feature prioritization, product strategy",
    allowedTools: ["Read", "Grep", "Glob", "WebSearch"],
    maxTurns: 15,
  },
  cto: {
    name: "CTO",
    model: "opus",
    description: "Technical standards, architecture review, technology decisions",
    allowedTools: ["Read", "Grep", "Glob", "WebSearch"],
    maxTurns: 15,
  },
  assistant: {
    name: "Assistant",
    model: "sonnet",
    description: "Message routing, delegation, general assistance",
    allowedTools: ["Read", "Grep", "Glob", "Bash"],
    maxTurns: 10,
  },
};

// ============================================================================
// Types
// ============================================================================

export interface InstallResult {
  /** Total agent files created */
  created: number;
  /** Agent files skipped (already exist) */
  skipped: number;
  /** Agent files that failed */
  failed: number;
  /** Details per role */
  details: Array<{
    role: AgentRole;
    status: "created" | "skipped" | "failed";
    path: string;
    error?: string;
  }>;
}

// ============================================================================
// Agent Installer
// ============================================================================

/**
 * Install .claude/agents/*.md files in a target project.
 *
 * @param projectPath - Target project directory
 * @param options - Install options
 * @returns InstallResult with per-role status
 */
export function installAgents(
  projectPath: string,
  options?: { force?: boolean; templatesRoot?: string },
): InstallResult {
  const agentsDir = join(projectPath, ".claude", "agents");
  const force = options?.force ?? false;

  // Use SoulLoader as SSOT for template loading (M-3: no duplicated regex)
  const soulLoader = createSoulLoader(
    options?.templatesRoot ? { templatesRoot: options.templatesRoot } : undefined,
  );

  // Ensure .claude/agents/ directory exists
  if (!existsSync(agentsDir)) {
    mkdirSync(agentsDir, { recursive: true });
  }

  const result: InstallResult = {
    created: 0,
    skipped: 0,
    failed: 0,
    details: [],
  };

  for (const role of VALID_AGENT_ROLES) {
    const agentFilePath = join(agentsDir, `${role}.md`);
    const meta = AGENT_METADATA[role];

    // Skip if file exists and not forcing
    if (existsSync(agentFilePath) && !force) {
      result.skipped++;
      result.details.push({ role, status: "skipped", path: agentFilePath });
      continue;
    }

    try {
      // Load SOUL content via SoulLoader (SSOT — frontmatter already stripped)
      const soulResult = soulLoader.load(role);
      const soulContent = soulResult.loaded
        ? soulResult.content
        : `# ${meta.name} Agent\n\nYou are the ${meta.name} agent for this project.\n`;

      // Build agent file content
      const agentContent = buildAgentFile(meta, soulContent);
      writeFileSync(agentFilePath, agentContent, "utf-8");

      result.created++;
      result.details.push({ role, status: "created", path: agentFilePath });
    } catch (err) {
      result.failed++;
      const detail: InstallResult["details"][number] = {
        role,
        status: "failed",
        path: agentFilePath,
      };
      detail.error = err instanceof Error ? err.message : String(err);
      result.details.push(detail);
    }
  }

  return result;
}

/**
 * Build agent file content with frontmatter + SOUL body.
 * Uses the canonical schema from .claude/agents/architect.md.
 */
function buildAgentFile(
  meta: AgentMetadata,
  soulContent: string,
): string {
  const toolsJson = JSON.stringify(meta.allowedTools);

  const frontmatter = [
    "---",
    `name: ${meta.name}`,
    `model: ${meta.model}`,
    `description: ${meta.description}`,
    `allowed-tools: ${toolsJson}`,
    `max-turns: ${meta.maxTurns}`,
    "---",
    "",
  ].join("\n");

  return frontmatter + soulContent;
}
