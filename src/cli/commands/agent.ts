/**
 * Agent Command
 *
 * Invokes SDLC agents via Claude Code with context injection.
 *
 * Usage:
 *   endiorbot @pm "plan payment gateway integration"
 *   endiorbot @coder --patch "fix the auth bug"
 *   endiorbot @architect --interactive "design microservices"
 *
 * Modes:
 *   (default)      READ mode - no file changes
 *   --patch        PATCH mode - generate diff, confirm before apply
 *   --interactive  INTERACTIVE mode - human takes over
 *
 * @module cli/commands/agent
 * @version 1.0.0
 * @date 2026-02-28
 * @status ACTIVE - Sprint 55
 */

import type { Command } from "commander";
import { getAgentRouter, type RoutingDecision } from "../../agents/orchestrator/agent-router.js";
import { parseMention } from "../../agents/orchestrator/mention-parser.js";
import { getContextInjector } from "../../agents/context/context-injector.js";
import { getProjectVerifier } from "../../agents/context/project-verifier.js";
import {
  getClaudeCodeBridge,
  promptConfirmation,
  type InvokeMode,
} from "../../agents/invoke/claude-code-bridge.js";
import { parseResponse } from "../../agents/invoke/response-parser.js";
import { validatePatch } from "../../agents/invoke/patch-validator.js";
import { formatManifestLog } from "../../agents/context/context-manifest.js";
import type { AgentRole } from "../../agents/types/handoff.js";
import { getWorkflowEngine } from "../../agents/orchestrator/workflow-engine.js";
import { getRiskClassifier } from "../../agents/safety/risk-classifier.js";
import { auditLog } from "../../agents/safety/audit-logger.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Agent command options.
 */
interface AgentOptions {
  patch?: boolean;
  interactive?: boolean;
  verbose?: boolean;
  dryRun?: boolean;
  tier?: "LITE" | "STANDARD" | "PROFESSIONAL" | "ENTERPRISE";
  timeout?: number;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Format agent role for display.
 */
function formatAgent(role: AgentRole): string {
  const icons: Record<string, string> = {
    researcher: "🔍",
    pm: "📋",
    pjm: "📊",
    architect: "🏗️",
    coder: "💻",
    reviewer: "👀",
    tester: "🧪",
    devops: "🚀",
    assistant: "🤖",
    ceo: "👔",
    cpo: "🎯",
    cto: "⚙️",
  };
  return `${icons[role] ?? "🔹"} @${role}`;
}

/**
 * Format mode for display.
 */
function formatMode(mode: InvokeMode): string {
  const formats: Record<InvokeMode, string> = {
    READ: "📖 READ",
    PATCH: "🔧 PATCH",
    INTERACTIVE: "💬 INTERACTIVE",
  };
  return formats[mode];
}

/**
 * Display routing decision.
 */
function displayRoutingDecision(decision: RoutingDecision): void {
  console.log("");
  console.log("┌─────────────────────────────────────────────────────────────┐");
  console.log(`│  ${formatAgent(decision.agent).padEnd(56)}│`);
  console.log("├─────────────────────────────────────────────────────────────┤");
  console.log(`│  Task: ${decision.message.slice(0, 51).padEnd(52)}│`);
  console.log(`│  Type: ${decision.classification.taskType.padEnd(52)}│`);
  console.log(`│  Complexity: ${decision.classification.complexity.padEnd(46)}│`);
  console.log(`│  Tier: ${decision.tier.padEnd(52)}│`);

  if (decision.warnings.length > 0) {
    console.log("│".padEnd(62) + "│");
    console.log(`│  ⚠️  Warnings:`.padEnd(62) + "│");
    for (const warning of decision.warnings) {
      console.log(`│     ${warning.slice(0, 54).padEnd(55)}│`);
    }
  }

  console.log("└─────────────────────────────────────────────────────────────┘");
}

/**
 * Display handoffs from response.
 */
function displayHandoffs(
  handoffs: Array<{ to: AgentRole; intent: string; priority: string }>
): void {
  if (handoffs.length === 0) return;

  console.log("");
  console.log("┌─────────────────────────────────────────────────────────────┐");
  console.log(`│  🔄 Handoff Requests (${handoffs.length})`.padEnd(62) + "│");
  console.log("├─────────────────────────────────────────────────────────────┤");

  for (const h of handoffs) {
    console.log(`│  → ${formatAgent(h.to)} [${h.priority}]`.padEnd(62) + "│");
    console.log(`│     ${h.intent.slice(0, 54).padEnd(55)}│`);
  }

  console.log("└─────────────────────────────────────────────────────────────┘");
}

// ============================================================================
// Command Action
// ============================================================================

/**
 * Agent command action.
 */
async function agentAction(
  input: string,
  options: AgentOptions
): Promise<void> {
  // Initialize Sprint 55B components
  const workflow = getWorkflowEngine();
  const riskClassifier = getRiskClassifier();
  const verifier = getProjectVerifier();

  // Determine mode
  let mode: InvokeMode = "READ";
  if (options.interactive) {
    mode = "INTERACTIVE";
  } else if (options.patch) {
    mode = "PATCH";
  }

  console.log("");
  console.log(`🤖 EndiorBot Agent Orchestrator`);
  console.log(`   Mode: ${formatMode(mode)}`);
  console.log("");

  // Verify project before proceeding
  const workspace = process.cwd();
  const projectCheck = verifier.quickCheck(workspace);
  if (!projectCheck.exists) {
    console.error(`❌ Invalid workspace: ${workspace}`);
    process.exit(1);
  }

  if (options.verbose && !projectCheck.hasSDLCConfig) {
    console.log("⚠️  No .sdlc-config.json found (using defaults)");
  }

  // Parse mention
  const parseResult = parseMention(input);
  if (!parseResult.success) {
    console.error(`❌ ${parseResult.error.message}`);
    console.log("");
    console.log("Usage:");
    console.log('  endiorbot @pm "plan payment gateway"');
    console.log('  endiorbot @coder --patch "fix auth bug"');
    process.exit(1);
  }

  const mention = parseResult.data;

  // Route to agent
  const router = getAgentRouter({
    tier: options.tier ?? "LITE",
  });

  const routeResult = await router.route(mention);
  if (!routeResult.success) {
    console.error(`❌ Routing failed: ${routeResult.error.message}`);
    process.exit(1);
  }

  const decision = routeResult.decision;
  displayRoutingDecision(decision);

  // Inject context
  console.log("\n🧠 Injecting context...");
  const injector = getContextInjector({
    tier: options.tier ?? "LITE",
    verbose: options.verbose ?? false,
  });

  const injection = await injector.inject({
    agent: decision.agent,
    task: decision.message,
    classification: decision.classification,
    workspace,
  });

  if (options.verbose) {
    console.log("\n" + formatManifestLog(injection.manifest));
  } else {
    console.log(`   Injected: ${injection.manifest.stats.injectedItems} items, ${injection.manifest.stats.injectedTokens} tokens`);
  }

  // Classify risk
  const riskResult = riskClassifier.classify({
    agent: decision.agent,
    mode,
    task: decision.message,
  });

  if (options.verbose) {
    console.log(`\n🛡️ Risk: ${riskResult.level} (${riskResult.confirmation} confirmation)`);
  }

  // Block CRITICAL actions without explicit confirmation
  if (riskResult.level === "CRITICAL" && !options.interactive) {
    console.log("\n⚠️  CRITICAL risk detected!");
    for (const factor of riskResult.factors) {
      console.log(`   - ${factor.name}: ${factor.description} (+${factor.weight})`);
    }
    const proceed = await promptConfirmation("\nProceed with this CRITICAL action?");
    if (!proceed) {
      console.log("\n⏸️  Action cancelled by user");
      auditLog({
        agent: decision.agent,
        task: decision.message,
        project: projectCheck.isGitRepo ? workspace.split("/").pop() ?? "unknown" : "unknown",
        mode,
        tier: options.tier ?? "LITE",
        status: "cancelled",
        risk: riskResult.level,
        duration_ms: 0, // Cancelled before execution
      });
      return;
    }
  }

  // Check if dry run
  if (options.dryRun) {
    console.log("\n🏃 Dry run - not invoking Claude Code");
    console.log("\nSystem Prompt:");
    console.log("-".repeat(60));
    console.log(injection.systemPrompt.slice(0, 500) + "...");
    console.log("-".repeat(60));
    return;
  }

  // Start workflow tracking
  const startTime = Date.now();
  const workflowContext = workflow.start(
    decision.agent,
    decision.message,
    undefined, // Classification passed via metadata
    { mode, workspace, taskType: decision.classification.taskType, complexity: decision.classification.complexity }
  );

  // Invoke Claude Code
  console.log(`\n⚡ Invoking Claude Code (${mode} mode)...`);
  const bridge = getClaudeCodeBridge({
    verbose: options.verbose ?? false,
    defaultTimeout: options.timeout ?? 300,
  });

  // Check if Claude Code is available
  const available = await bridge.isAvailable();
  if (!available) {
    console.error("❌ Claude Code CLI not found. Make sure 'claude' is in your PATH.");
    process.exit(1);
  }

  try {
    if (mode === "INTERACTIVE") {
      // Interactive mode - hand over to human
      await bridge.invokeInteractive({
        systemPrompt: injection.systemPrompt,
        userPrompt: injection.userPrompt,
        workspace,
        agent: decision.agent,
      });
      console.log("\n✅ Interactive session complete");
      return;
    }

    if (mode === "PATCH") {
      // Patch mode - generate diff, confirm, apply
      // First, invoke without callback to get the diff
      const initialResponse = await bridge.invokePatch(
        {
          systemPrompt: injection.systemPrompt,
          userPrompt: injection.userPrompt,
          workspace,
          agent: decision.agent,
          timeout: options.timeout ?? 300,
        }
      );

      // Validate patch if we got a diff
      if (initialResponse.diff) {
        const validation = validatePatch(initialResponse.diff, workspace);
        if (!validation.allowed) {
          console.log("\n⚠️  Patch validation failed:");
          for (const risk of validation.risks) {
            console.log(`   - [${risk.severity}] ${risk.description}`);
          }
          console.log("\n" + "─".repeat(60));
          console.log(initialResponse.output);
          console.log("─".repeat(60));
          return;
        }

        // Show diff preview
        console.log("\n" + "─".repeat(60));
        console.log(initialResponse.output);
        console.log("─".repeat(60));

        // Ask for confirmation
        const confirmed = await promptConfirmation("\nApply this patch?");
        if (confirmed && initialResponse.diff) {
          // Re-invoke with callback to actually apply
          const response = await bridge.invokePatch(
            {
              systemPrompt: injection.systemPrompt,
              userPrompt: injection.userPrompt,
              workspace,
              agent: decision.agent,
              timeout: options.timeout ?? 300,
            },
            async () => true // Already confirmed
          );

          if (response.applied) {
            console.log("\n✅ Patch applied successfully");
          } else {
            console.log("\n❌ Failed to apply patch");
            if (response.error) {
              console.error(`   ${response.error}`);
            }
          }

          // Parse for handoffs
          const parsed = parseResponse(response.output);
          displayHandoffs(parsed.handoffs);
        } else {
          console.log("\n⏸️  Patch not applied (declined)");
        }
      } else {
        // No diff generated
        console.log("\n" + "─".repeat(60));
        if (initialResponse.success) {
          console.log(initialResponse.output);
        } else {
          console.error(`❌ Error: ${initialResponse.error}`);
        }
        console.log("─".repeat(60));
        console.log("\n⚠️  No diff generated");

        // Parse for handoffs
        const parsed = parseResponse(initialResponse.output);
        displayHandoffs(parsed.handoffs);
      }

      return;
    }

    // READ mode (default)
    const response = await bridge.invokeRead({
      systemPrompt: injection.systemPrompt,
      userPrompt: injection.userPrompt,
      workspace,
      agent: decision.agent,
      timeout: options.timeout ?? 300,
    });

    // Display result
    console.log("\n" + "─".repeat(60));
    if (response.success) {
      console.log(response.output);
    } else {
      console.error(`❌ Error: ${response.error}`);
      process.exit(1);
    }
    console.log("─".repeat(60));

    // Parse for handoffs
    const parsed = parseResponse(response.output);
    displayHandoffs(parsed.handoffs);

    // Prompt for handoff continuation
    if (parsed.hasHandoff && parsed.handoffs.length > 0) {
      const firstHandoff = parsed.handoffs[0];
      if (firstHandoff) {
        const validation = router.validateTransition(decision.agent, firstHandoff.to);

        if (validation.allowed) {
          console.log("");
          const continueHandoff = await promptConfirmation(
            `Continue to ${formatAgent(firstHandoff.to)}?`
          );

          if (continueHandoff) {
            // Recursive call to handle next agent
            const nextInput = `@${firstHandoff.to} "${firstHandoff.intent}"`;
            await agentAction(nextInput, options);
          }
        } else {
          console.log(`\n⚠️  Handoff blocked: ${validation.reason}`);
        }
      }
    }

    // Log successful completion
    const durationMs = Date.now() - startTime;
    auditLog({
      agent: decision.agent,
      task: decision.message,
      project: projectCheck.isGitRepo ? workspace.split("/").pop() ?? "unknown" : "unknown",
      mode,
      tier: options.tier ?? "LITE",
      status: "success",
      risk: riskResult.level,
      duration_ms: durationMs,
      ...(response.tokenUsage?.input ? { tokens_in: response.tokenUsage.input } : {}),
      ...(response.tokenUsage?.output ? { tokens_out: response.tokenUsage.output } : {}),
      ...(parsed.handoffs[0]?.to ? { handoff_to: parsed.handoffs[0].to } : {}),
    });

    console.log("\n✅ Agent invocation complete");
    console.log(`   Duration: ${response.durationMs ?? durationMs}ms`);
    if (response.tokenUsage) {
      console.log(`   Tokens: ${response.tokenUsage.input} in / ${response.tokenUsage.output} out`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    // Log failure
    auditLog({
      agent: decision.agent,
      task: decision.message,
      project: projectCheck.isGitRepo ? workspace.split("/").pop() ?? "unknown" : "unknown",
      mode,
      tier: options.tier ?? "LITE",
      status: "error",
      risk: riskResult.level,
      duration_ms: Date.now() - startTime,
    });

    // Update workflow state
    workflow.failStep(workflowContext.id, message);

    console.error(`\n❌ Agent invocation failed: ${message}`);
    process.exit(1);
  }
}

// ============================================================================
// Command Registration
// ============================================================================

/**
 * Register agent command.
 *
 * Supports @agent syntax at the start of input.
 */
export function registerAgentCommand(program: Command): void {
  // Note: Commander doesn't support @ prefix directly,
  // so we register as a regular command and handle @ parsing
  program
    .command("agent <input...>")
    .alias("@")
    .description("Invoke an SDLC agent via Claude Code")
    .option("--patch", "Enable PATCH mode (generate diff, confirm before apply)")
    .option("--interactive", "Enable INTERACTIVE mode (human takes over)")
    .option("-v, --verbose", "Show detailed context manifest and output")
    .option("--dry-run", "Show what would be done without executing")
    .option(
      "--tier <tier>",
      "Set tier (LITE, STANDARD, PROFESSIONAL, ENTERPRISE)",
      "LITE"
    )
    .option("--timeout <seconds>", "Set timeout in seconds", "300")
    .action(async (inputParts: string[], options: AgentOptions) => {
      // Join input parts back together
      let input = inputParts.join(" ");

      // Ensure @ prefix
      if (!input.startsWith("@")) {
        input = "@" + input;
      }

      // Parse timeout
      if (typeof options.timeout === "string") {
        options.timeout = parseInt(options.timeout, 10);
      }

      await agentAction(input, options);
    });

  // Also register shorthand commands for each agent
  const agents: AgentRole[] = [
    "researcher",
    "pm",
    "pjm",
    "architect",
    "coder",
    "reviewer",
    "tester",
    "devops",
  ];

  for (const agent of agents) {
    program
      .command(`${agent} <message...>`)
      .description(`Invoke @${agent} agent`)
      .option("--patch", "Enable PATCH mode")
      .option("--interactive", "Enable INTERACTIVE mode")
      .option("-v, --verbose", "Show detailed output")
      .option("--dry-run", "Show what would be done")
      .option("--tier <tier>", "Set tier", "LITE")
      .option("--timeout <seconds>", "Set timeout", "300")
      .action(async (messageParts: string[], options: AgentOptions) => {
        const message = messageParts.join(" ");
        const input = `@${agent} "${message}"`;

        if (typeof options.timeout === "string") {
          options.timeout = parseInt(options.timeout, 10);
        }

        await agentAction(input, options);
      });
  }
}
