/**
 * Agent Scope
 *
 * Defines permission boundaries for agents.
 * Implements workspace restrictions and capability limits.
 */

import path from "node:path";
import type { AgentPermissions, AgentScope, AgentWorkspace } from "./types.js";

// ============================================================================
// Default Configurations
// ============================================================================

const DEFAULT_BLOCKED_PATHS = [
  ".env",
  ".env.*",
  "*.pem",
  "*.key",
  "credentials.json",
  "secrets/",
  "config/prod/",
];

const DEFAULT_WORKSPACE_DIR = process.cwd();

// ============================================================================
// Scope Resolver
// ============================================================================

export interface AgentScopeConfig {
  id?: string | undefined;
  name?: string | undefined;
  workspacePath?: string | undefined;
  allowedPaths?: string[] | undefined;
  blockedPaths?: string[] | undefined;
  permissions?: Partial<AgentPermissions> | undefined;
}

export function resolveAgentScope(config: AgentScopeConfig = {}): AgentScope {
  const id = config.id ?? "default";
  const name = config.name ?? "Default Agent";

  const workspacePath = config.workspacePath ?? DEFAULT_WORKSPACE_DIR;

  const workspace: AgentWorkspace = {
    path: workspacePath,
    allowedPaths: config.allowedPaths ?? [workspacePath],
    blockedPaths: config.blockedPaths ?? DEFAULT_BLOCKED_PATHS,
  };

  const permissions: AgentPermissions = {
    canExecuteCommands: config.permissions?.canExecuteCommands ?? true,
    canModifyFiles: config.permissions?.canModifyFiles ?? true,
    canAccessNetwork: config.permissions?.canAccessNetwork ?? true,
    canApproveGates: config.permissions?.canApproveGates ?? false,
    maxTokenBudget: config.permissions?.maxTokenBudget ?? 50000,
  };

  return { id, name, workspace, permissions };
}

// ============================================================================
// Path Validation
// ============================================================================

export function isPathAllowed(
  targetPath: string,
  scope: AgentScope,
): boolean {
  const normalizedTarget = path.resolve(targetPath);
  const normalizedWorkspace = path.resolve(scope.workspace.path);

  // Check if path is within workspace
  if (!normalizedTarget.startsWith(normalizedWorkspace)) {
    return false;
  }

  // Check blocked patterns
  for (const pattern of scope.workspace.blockedPaths) {
    if (matchesPattern(normalizedTarget, pattern)) {
      return false;
    }
  }

  // If allowedPaths is specified and non-empty, check against it
  if (scope.workspace.allowedPaths.length > 0) {
    const isAllowed = scope.workspace.allowedPaths.some((allowed) => {
      const normalizedAllowed = path.resolve(allowed);
      return normalizedTarget.startsWith(normalizedAllowed);
    });

    if (!isAllowed) {
      return false;
    }
  }

  return true;
}

function matchesPattern(targetPath: string, pattern: string): boolean {
  // Simple glob-like matching
  const filename = path.basename(targetPath);

  // Handle directory patterns (ending with /)
  if (pattern.endsWith("/")) {
    const dirPattern = pattern.slice(0, -1);
    return targetPath.includes(`/${dirPattern}/`) || targetPath.endsWith(`/${dirPattern}`);
  }

  // Handle wildcard patterns
  if (pattern.includes("*")) {
    const regex = new RegExp(
      "^" + pattern.replace(/\./g, "\\.").replace(/\*/g, ".*") + "$",
    );
    return regex.test(filename);
  }

  // Exact match
  return filename === pattern || targetPath.endsWith(`/${pattern}`);
}

// ============================================================================
// Permission Checks
// ============================================================================

export function canExecuteCommand(
  command: string,
  scope: AgentScope,
): { allowed: boolean; reason?: string } {
  if (!scope.permissions.canExecuteCommands) {
    return { allowed: false, reason: "Command execution not permitted" };
  }

  // Block dangerous commands
  const dangerousPatterns = [
    /rm\s+-rf\s+[\/~]/,
    /dd\s+if=/,
    /mkfs\./,
    /:(){ :|:& };:/,
    />\s*\/dev\/sd/,
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(command)) {
      return { allowed: false, reason: "Command matches dangerous pattern" };
    }
  }

  return { allowed: true };
}

export function canModifyFile(
  filePath: string,
  scope: AgentScope,
): { allowed: boolean; reason?: string } {
  if (!scope.permissions.canModifyFiles) {
    return { allowed: false, reason: "File modification not permitted" };
  }

  if (!isPathAllowed(filePath, scope)) {
    return { allowed: false, reason: "Path not in allowed workspace" };
  }

  return { allowed: true };
}

// ============================================================================
// Predefined Scopes
// ============================================================================

export function createCEOScope(workspacePath?: string): AgentScope {
  return resolveAgentScope({
    id: "ceo",
    name: "CEO Agent",
    workspacePath,
    permissions: {
      canExecuteCommands: true,
      canModifyFiles: true,
      canAccessNetwork: true,
      canApproveGates: true,
      maxTokenBudget: 200000,
    },
  });
}

export function createJuniorScope(workspacePath?: string): AgentScope {
  return resolveAgentScope({
    id: "junior",
    name: "Junior Agent",
    workspacePath,
    allowedPaths: workspacePath ? [
      path.join(workspacePath, "src"),
      path.join(workspacePath, "tests"),
    ] : undefined,
    blockedPaths: [
      ...DEFAULT_BLOCKED_PATHS,
      "*.config.js",
      "*.config.ts",
      "deploy/",
      "scripts/",
    ],
    permissions: {
      canExecuteCommands: true,
      canModifyFiles: true,
      canAccessNetwork: true,
      canApproveGates: false,
      maxTokenBudget: 50000,
    },
  });
}

export function createReadOnlyScope(workspacePath?: string): AgentScope {
  return resolveAgentScope({
    id: "readonly",
    name: "Read-Only Agent",
    workspacePath,
    permissions: {
      canExecuteCommands: false,
      canModifyFiles: false,
      canAccessNetwork: true,
      canApproveGates: false,
      maxTokenBudget: 10000,
    },
  });
}
