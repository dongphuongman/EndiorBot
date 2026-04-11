/**
 * Exec-Policy Prompt Adapter
 *
 * Provides the PromptFn interface for CEO approval of exec-policy decisions.
 * M1 ships only the CLI implementation (terminal promptConfirmation).
 *
 * Non-CLI origins fail closed (deny) in M1 per ADR-046 Amendment 1:
 *   "Until adapter wiring exists, any non-CLI originChannel fails closed."
 *
 * Future OTT adapters inject a channel-aware PromptFn at session construction.
 *
 * @module security/exec-approvals/prompt
 * @version 1.0.0
 * @date 2026-04-11
 * @status ACTIVE - Sprint 132 M1
 * @authority ADR-046 FULL Amendment 1, M1-exec-policy-design.md §9.2
 * @sprint 132
 */

import * as readline from "readline";
import type { PromptFn } from "./types.js";

// ============================================================================
// CLI Prompt Implementation
// ============================================================================

/**
 * Default CLI prompt — asks CEO via stdin/stdout.
 *
 * @param message - Context message shown to CEO
 * @param command - The command awaiting approval
 * @returns true if CEO approved (y/yes), false otherwise
 */
export const cliPromptFn: PromptFn = async (message: string, command: string): Promise<boolean> => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    const prompt = `\n[exec-policy] ${message}\nCommand: ${command}\nApprove? [y/N] `;
    rl.question(prompt, (answer) => {
      rl.close();
      const normalized = answer.trim().toLowerCase();
      resolve(normalized === "y" || normalized === "yes");
    });
  });
};

// ============================================================================
// Fail-closed default (non-CLI origins)
// ============================================================================

/**
 * Fail-closed prompt for non-CLI origins.
 *
 * Per ADR-046 Amendment 1: OTT prompt routing is deferred until the adapter
 * wiring sprint. Until then, any non-CLI originChannel's prompt defaults to
 * deny with an explicit audit message.
 *
 * The audit record reason will carry "OTT prompt routing deferred — awaiting adapter wiring".
 */
export const failClosedPromptFn: PromptFn = async (
  _message: string,
  _command: string
): Promise<boolean> => {
  // Always deny — OTT prompt routing deferred (ADR-046 Amendment 1).
  return false;
};

/**
 * Select the appropriate PromptFn for an origin channel.
 *
 * CLI → cliPromptFn (interactive terminal prompt)
 * All other channels → failClosedPromptFn (deny, OTT routing deferred)
 */
export function selectPromptFn(originChannel: "web" | "telegram" | "zalo" | "cli"): PromptFn {
  if (originChannel === "cli") {
    return cliPromptFn;
  }
  return failClosedPromptFn;
}
