/**
 * Structure Generator
 *
 * Generates project structure (docs/, .claude/, root files).
 *
 * @module sdlc/scaffold/structure-generator
 * @version 1.0.0
 * @date 2026-03-01
 * @status ACTIVE - Sprint 61
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { createHash } from "node:crypto";
import { createLogger } from "../../logging/index.js";
import type {
  ScaffoldConfig,
  ScaffoldResult,
  StepResult,
  ProjectConfig,
  ProjectTier,
} from "./types.js";
import type { ProjectSnapshot } from "../compliance/fix-types.js";
import { TIER_STAGES } from "./types.js";
import {
  generateSdlcConfig,
  serializeSdlcConfig,
  generateClaudeMd,
  generateIdentityMd,
  generateAgentsMd,
} from "./templates/index.js";
import { getStageQuestion, formatStageName } from "./tier-detector.js";
import {
  STAGE_GATE_MAP,
  STAGE_UPSTREAM,
  STAGE_QUESTIONS,
  getAgentForStage,
} from "../compliance/fix-types.js";
import { STAGE_CONTENT_REQUIREMENTS } from "../compliance/content-checker.js";

const logger = createLogger("structure-generator");

// ============================================================================
// Main Scaffold Function
// ============================================================================

/**
 * Scaffold a project with SDLC structure.
 */
export async function scaffoldProject(
  config: ScaffoldConfig
): Promise<ScaffoldResult> {
  const startTime = Date.now();
  const steps: StepResult[] = [];

  logger.info("Starting project scaffold", {
    project: config.projectName,
    tier: config.tier,
    dryRun: config.dryRun,
  });

  const projectConfig: ProjectConfig = {
    id: slugify(config.projectName),
    name: config.projectName,
    description: config.projectDescription ?? "",
    tier: config.tier,
    frameworkVersion: "6.3.0",
  };

  try {
    // Step 1: Create .sdlc-config.json
    steps.push(
      await executeStep(
        "Create .sdlc-config.json",
        join(config.targetPath, ".sdlc-config.json"),
        () => serializeSdlcConfig(generateSdlcConfig(projectConfig, config.snapshot)),
        config
      )
    );

    // Step 2: Create CLAUDE.md
    steps.push(
      await executeStep(
        "Generate CLAUDE.md",
        join(config.targetPath, "CLAUDE.md"),
        () => generateClaudeMd(projectConfig, config.snapshot),
        config
      )
    );

    // Step 3: Create IDENTITY.md
    steps.push(
      await executeStep(
        "Generate IDENTITY.md",
        join(config.targetPath, "IDENTITY.md"),
        () => generateIdentityMd(projectConfig, config.snapshot),
        config
      )
    );

    // Step 4: Create AGENTS.md (STANDARD+)
    if (shouldCreateForTier(config.tier, "STANDARD")) {
      steps.push(
        await executeStep(
          "Generate AGENTS.md",
          join(config.targetPath, "AGENTS.md"),
          () => generateAgentsMd(projectConfig),
          config
        )
      );
    }

    // Step 5: Create docs/ structure
    const docsSteps = await createDocsStructure(config, projectConfig, config.snapshot);
    steps.push(...docsSteps);

    // Step 6: Create .claude/ structure
    const claudeSteps = await createClaudeStructure(config);
    steps.push(...claudeSteps);

    // Step 7: Update .gitignore
    const gitignoreStep = await updateGitignore(config.targetPath, config);
    steps.push(gitignoreStep);

    const success = steps.every(
      (s) => s.status !== "error"
    );

    logger.info("Scaffold complete", {
      success,
      steps: steps.length,
      created: steps.filter((s) => s.status === "created").length,
      skipped: steps.filter((s) => s.status === "skipped").length,
    });

    return {
      steps,
      success,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    logger.error("Scaffold failed", {
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      steps,
      success: false,
      durationMs: Date.now() - startTime,
    };
  }
}

// ============================================================================
// Step Execution
// ============================================================================

/**
 * Execute a single scaffold step.
 */
async function executeStep(
  name: string,
  filePath: string,
  contentFn: () => string,
  config: ScaffoldConfig
): Promise<StepResult> {
  const exists = existsSync(filePath);

  // Dry run mode
  if (config.dryRun) {
    return {
      name,
      path: filePath,
      status: exists ? "would-update" : "would-create",
    };
  }

  // Skip if exists and not forcing
  if (exists && !config.force) {
    // Check if content is same (skip update)
    const existingContent = readFileSync(filePath, "utf-8");
    const newContent = contentFn();

    if (hashContent(existingContent) === hashContent(newContent)) {
      return {
        name,
        path: filePath,
        status: "skipped",
      };
    }

    // Content differs - preserve existing
    return {
      name,
      path: filePath,
      status: "preserved",
    };
  }

  // Create or update
  try {
    const content = contentFn();
    ensureDir(dirname(filePath));
    writeFileSync(filePath, content, "utf-8");

    return {
      name,
      path: filePath,
      status: exists ? "updated" : "created",
    };
  } catch (error) {
    return {
      name,
      path: filePath,
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ============================================================================
// Docs Structure
// ============================================================================

/**
 * Create docs/ structure for tier.
 */
async function createDocsStructure(
  config: ScaffoldConfig,
  projectConfig: ProjectConfig,
  snapshot?: ProjectSnapshot,
): Promise<StepResult[]> {
  const steps: StepResult[] = [];
  const docsPath = join(config.targetPath, "docs");
  const stages = TIER_STAGES[config.tier];

  for (const stage of stages) {
    const stagePath = join(docsPath, stage);

    // Create stage directory
    steps.push(
      await executeStep(
        `Create ${stage}/`,
        join(stagePath, "README.md"),
        () => generateStageReadme(stage, projectConfig, snapshot),
        config
      )
    );
  }

  return steps;
}

/**
 * Generate README for a stage directory.
 */
function generateStageReadme(
  stage: string,
  project: ProjectConfig,
  snapshot?: ProjectSnapshot,
): string {
  const name = formatStageName(stage);
  const question = STAGE_QUESTIONS[stage] ?? getStageQuestion(stage);

  const lines: string[] = [];

  lines.push(`# ${stage} - ${name}`);
  lines.push("");
  lines.push("## Purpose");
  lines.push("");
  if (question) lines.push(`**Key Question:** ${question}`);
  lines.push("");
  lines.push(`This stage contains documentation for the ${name.toLowerCase()} phase of ${project.name}.`);
  lines.push("");
  lines.push("---");

  // Test infrastructure section (Sprint 79 — snapshot-enriched)
  if (stage === "05-test" && snapshot) {
    const testInfra = buildTestInfraSection(snapshot);
    if (testInfra) lines.push(testInfra);
  }

  // Gate requirements checklist
  const gates = STAGE_GATE_MAP[stage] ?? [];
  if (gates.length > 0) {
    lines.push("");
    lines.push("## Quality Gate Requirements");
    lines.push("");
    lines.push(`This stage feeds gate(s): **${gates.join(", ")}**`);
    lines.push("");
    for (const gate of gates) {
      lines.push(`- [ ] **${gate}**: Document required evidence for this gate`);
    }
    lines.push("");
    lines.push("---");
  }

  // Upstream dependencies table
  const upstream = STAGE_UPSTREAM[stage] ?? [];
  if (upstream.length > 0) {
    lines.push("");
    lines.push("## Dependencies");
    lines.push("");
    lines.push("| Upstream Stage | What to Consume |");
    lines.push("|---------------|-----------------|");
    for (const up of upstream) {
      lines.push(`| [${up}](../${up}/) | Cite specific artifacts from this stage |`);
    }
    lines.push("");
    lines.push("---");
  }

  // Artifact checklist from STAGE_CONTENT_REQUIREMENTS
  const requirements = STAGE_CONTENT_REQUIREMENTS[stage];
  if (requirements) {
    const owner = getAgentForStage(stage, project.tier);
    lines.push("");
    lines.push("## Artifact Checklist");
    lines.push("");
    lines.push("| Artifact | Required | Status | Owner |");
    lines.push("|----------|----------|--------|-------|");
    for (const artifact of requirements.requiredArtifacts) {
      lines.push(`| \`${artifact}\` | ✅ Required | [ ] Pending | @${owner} |`);
    }
    for (const artifact of (requirements.optionalArtifacts ?? []).slice(0, 4)) {
      lines.push(`| \`${artifact}\` | ⬜ Optional | [ ] — | — |`);
    }
    lines.push("");
    lines.push("---");
  }

  lines.push("");
  lines.push(`*Generated by EndiorBot - SDLC Framework v${project.frameworkVersion}*`);

  return lines.join("\n") + "\n";
}

/**
 * Build test infrastructure section for 05-test stage README.
 */
function buildTestInfraSection(snapshot: ProjectSnapshot): string {
  const scripts = snapshot.techStack.scripts ?? {};
  const pm = snapshot.techStack.packageManager ?? "pnpm";

  const testCmd = scripts["test"] ?? scripts["test:unit"] ?? null;
  const e2eFiles = snapshot.testFiles.filter((f) => f.type === "e2e");
  const unitFiles = snapshot.testFiles.filter((f) => f.type === "unit" || f.type === "unknown");

  const infra: string[] = [];
  if (testCmd) infra.push(`- Test command: \`${pm} run test\``);

  const deps = [...snapshot.techStack.dependencies, ...snapshot.techStack.devDependencies];
  if (deps.includes("playwright") || deps.includes("@playwright/test")) {
    infra.push(`- **Playwright** (e2e): ${e2eFiles.length} test file(s) detected`);
  }
  if (deps.includes("vitest") || deps.includes("jest")) {
    const fw = deps.includes("vitest") ? "Vitest" : "Jest";
    infra.push(`- **${fw}** (unit): ${unitFiles.length} test file(s) detected`);
  } else if (unitFiles.length > 0) {
    infra.push(`- Unit tests: ${unitFiles.length} test file(s) detected`);
  }

  if (infra.length === 0) return "";

  return `\n## Detected Test Infrastructure\n\n${infra.join("\n")}\n\n---\n`;
}

// ============================================================================
// Claude Structure
// ============================================================================

/**
 * Create .claude/ structure.
 */
async function createClaudeStructure(
  config: ScaffoldConfig
): Promise<StepResult[]> {
  const steps: StepResult[] = [];
  const claudePath = join(config.targetPath, ".claude");

  // Create commands/
  steps.push(
    await executeStep(
      "Create .claude/commands/gate.md",
      join(claudePath, "commands", "gate.md"),
      () => generateGateCommand(),
      config
    )
  );

  steps.push(
    await executeStep(
      "Create .claude/commands/consult.md",
      join(claudePath, "commands", "consult.md"),
      () => generateConsultCommand(),
      config
    )
  );

  // Create hooks/
  steps.push(
    await executeStep(
      "Create .claude/hooks/pre-tool-use.sh",
      join(claudePath, "hooks", "pre-tool-use.sh"),
      () => generatePreToolUseHook(),
      config
    )
  );

  // Create settings.json
  steps.push(
    await executeStep(
      "Create .claude/settings.json",
      join(claudePath, "settings.json"),
      () => generateClaudeSettings(),
      config
    )
  );

  return steps;
}

/**
 * Generate gate command.
 */
function generateGateCommand(): string {
  return `---
description: Check SDLC gate status
model: sonnet
---

# Gate Command

Check SDLC gate status using EndiorBot.

## Usage

\`\`\`
/project:gate status
/project:gate check G2
/project:gate recommend G3
\`\`\`

## Implementation

\`\`\`bash
# Thin client pattern - call EndiorBot core
./endiorbot.mjs gate "$@"
\`\`\`
`;
}

/**
 * Generate consult command.
 */
function generateConsultCommand(): string {
  return `---
description: Multi-model consultation
model: sonnet
---

# Consult Command

Query multiple AI models for consensus on decisions.

## Usage

\`\`\`
/project:consult "Should we use PostgreSQL or MongoDB?"
\`\`\`

## Implementation

\`\`\`bash
# Thin client pattern - call EndiorBot core
./endiorbot.mjs consult "$@"
\`\`\`
`;
}

/**
 * Generate pre-tool-use hook.
 */
function generatePreToolUseHook(): string {
  return `#!/bin/bash
# Pre-Tool-Use Hook - Secret Guard
#
# Blocks access to sensitive files
# INVARIANT: Hooks receive JSON via stdin

INPUT=$(cat /dev/stdin)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')
FILE_PATH=$(echo "$INPUT" | jq -r '.file_path // empty')

# Block sensitive files
BLOCKED_PATTERNS=(
  ".env"
  ".env.*"
  "*.pem"
  "*.key"
  "*credentials*"
  "*secret*"
)

for pattern in "\${BLOCKED_PATTERNS[@]}"; do
  if [[ "$FILE_PATH" == $pattern ]]; then
    echo "BLOCKED: Access to sensitive file pattern: $pattern"
    exit 1
  fi
done

exit 0
`;
}

/**
 * Generate Claude settings.
 */
function generateClaudeSettings(): string {
  // Sprint 136 hook-case fix (2026-04-18): Claude Code CLI expects PascalCase
  // hook event names (PreToolUse, PostToolUse, etc.). The earlier camelCase
  // (preToolUse) was silently ignored, causing scaffolded projects to report
  // "Invalid Settings" on `claude doctor`. See BetterBox-TTS field report.
  return JSON.stringify(
    {
      hooks: {
        PreToolUse: ".claude/hooks/pre-tool-use.sh",
      },
      commands: {
        gate: ".claude/commands/gate.md",
        consult: ".claude/commands/consult.md",
      },
    },
    null,
    2
  );
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Convert string to slug format.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Ensure directory exists.
 */
function ensureDir(dirPath: string): void {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Hash content for comparison.
 */
function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Check if feature should be created for tier.
 */
function shouldCreateForTier(
  actualTier: ProjectTier,
  requiredTier: ProjectTier
): boolean {
  const order: Record<ProjectTier, number> = {
    LITE: 0,
    STANDARD: 1,
    PROFESSIONAL: 2,
    ENTERPRISE: 3,
  };
  return order[actualTier] >= order[requiredTier];
}

// ============================================================================
// Backup Functions
// ============================================================================

/**
 * Create backup of existing files before force overwrite.
 */
export async function createBackup(
  projectPath: string,
  files: string[]
): Promise<string> {
  const backupDir = join(projectPath, ".endiorbot", "backups", String(Date.now()));
  ensureDir(backupDir);

  for (const file of files) {
    const srcPath = join(projectPath, file);
    // Skip directories - only copy files
    if (existsSync(srcPath) && !statSync(srcPath).isDirectory()) {
      const destPath = join(backupDir, file);
      ensureDir(dirname(destPath));
      copyFileSync(srcPath, destPath);
    }
  }

  logger.info("Backup created", { path: backupDir, files: files.length });
  return backupDir;
}

// ============================================================================
// Gitignore Update
// ============================================================================

/** Lines to add to .gitignore */
const GITIGNORE_ENTRIES = [
  "# Claude Code / EndiorBot",
  ".claude/",
  ".endiorbot/",
  // Sprint 138 P3-03: no trailing slash so the pattern matches both
  // symlinks (e.g. .sdlc-framework → shared-framework-repo) and plain
  // directories produced by `endiorbot init`.
  ".sdlc-framework",
  "",
];

/**
 * Update .gitignore with Claude/EndiorBot entries.
 */
export async function updateGitignore(
  projectPath: string,
  config: ScaffoldConfig
): Promise<StepResult> {
  const gitignorePath = join(projectPath, ".gitignore");

  // Dry-run mode
  if (config.dryRun) {
    const exists = existsSync(gitignorePath);
    return {
      name: "Update .gitignore",
      path: gitignorePath,
      status: exists ? "would-update" : "would-create",
    };
  }

  try {
    if (existsSync(gitignorePath)) {
      const content = readFileSync(gitignorePath, "utf-8");

      // Check if already has our entries
      if (content.includes(".claude/") && content.includes(".endiorbot/")) {
        return {
          name: "Update .gitignore",
          path: gitignorePath,
          status: "skipped",
        };
      }

      // Append missing entries
      const linesToAdd = GITIGNORE_ENTRIES.filter(
        (line) => line.trim() === "" || !content.includes(line)
      );

      if (linesToAdd.length > 0) {
        const appendContent = "\n" + linesToAdd.join("\n");
        writeFileSync(gitignorePath, content + appendContent, "utf-8");
        return {
          name: "Update .gitignore",
          path: gitignorePath,
          status: "updated",
        };
      }

      return {
        name: "Update .gitignore",
        path: gitignorePath,
        status: "skipped",
      };
    } else {
      // Create new .gitignore
      writeFileSync(gitignorePath, GITIGNORE_ENTRIES.join("\n") + "\n", "utf-8");
      return {
        name: "Create .gitignore",
        path: gitignorePath,
        status: "created",
      };
    }
  } catch (error) {
    return {
      name: "Update .gitignore",
      path: gitignorePath,
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
