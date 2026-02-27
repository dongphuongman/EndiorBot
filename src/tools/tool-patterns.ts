/**
 * Tool Pattern Recognition
 * Sprint 51 - Day 7-8 - Composio Integration Phase 2
 *
 * Tracks tool usage patterns in Brain Layer 2 to:
 * - Learn CEO preferences for tools
 * - Enable auto-approval of common patterns
 * - Detect anomalous tool usage
 *
 * @module tools/tool-patterns
 * @version 1.0.0
 * @date 2026-02-27
 * @status ACTIVE - Sprint 51
 */

import crypto from 'crypto';
import type { ToolRisk } from './types.js';
import { createLogger, type Logger } from '../logging/index.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Tool usage pattern.
 */
export interface ToolPattern {
  /** Unique pattern ID */
  id: string;
  /** Tool name */
  tool_name: string;
  /** Argument pattern (keys with value patterns) */
  argument_pattern: Record<string, ArgumentPattern>;
  /** Number of times this pattern was used */
  frequency: number;
  /** Success rate (0-1) */
  success_rate: number;
  /** Eligible for auto-approval (5+ uses, 95%+ success) */
  auto_approve_eligible: boolean;
  /** Risk level of the tool */
  risk: ToolRisk;
  /** First seen timestamp */
  first_seen: Date;
  /** Last used timestamp */
  last_used: Date;
  /** Principal ID */
  principal_id: string;
}

/**
 * Argument pattern for matching.
 */
export interface ArgumentPattern {
  /** Pattern type */
  type: 'exact' | 'prefix' | 'suffix' | 'domain' | 'any';
  /** Pattern value (for prefix: "owner/*", domain: "*@company.com") */
  value: string;
}

/**
 * Tool preference model for a principal.
 */
export interface ToolPreferenceModel {
  /** Preferred tools by category */
  preferred_tools: Map<string, string[]>;
  /** Approval speed preference */
  approval_speed: 'fast' | 'careful';
  /** Risk tolerance */
  risk_tolerance: 'low' | 'medium' | 'high';
  /** Common workflows */
  common_workflows: string[];
  /** Auto-approve threshold (frequency needed) */
  auto_approve_threshold: number;
}

/**
 * Configuration for pattern recognizer.
 */
export interface ToolPatternConfig {
  /** Minimum frequency for auto-approve eligibility */
  minFrequencyForAutoApprove?: number;
  /** Minimum success rate for auto-approve eligibility */
  minSuccessRateForAutoApprove?: number;
  /** Maximum patterns to store per principal */
  maxPatternsPerPrincipal?: number;
  /** Pattern retention days */
  patternRetentionDays?: number;
}

// =============================================================================
// Default Configuration
// =============================================================================

const DEFAULT_CONFIG: Required<ToolPatternConfig> = {
  minFrequencyForAutoApprove: 5,
  minSuccessRateForAutoApprove: 0.95,
  maxPatternsPerPrincipal: 100,
  patternRetentionDays: 90,
};

// =============================================================================
// ToolPatternRecognizer
// =============================================================================

/**
 * Recognizes and tracks tool usage patterns for CEO preference learning.
 */
export class ToolPatternRecognizer {
  private patterns: Map<string, ToolPattern[]> = new Map();
  private config: Required<ToolPatternConfig>;
  private log: Logger;

  constructor(config: ToolPatternConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.log = createLogger('tool-patterns');
  }

  // ===========================================================================
  // Pattern Recording
  // ===========================================================================

  /**
   * Record tool usage for pattern learning.
   */
  recordToolUsage(
    principal_id: string,
    tool_name: string,
    args: Record<string, unknown>,
    success: boolean,
    risk: ToolRisk
  ): ToolPattern {
    const principalPatterns = this.patterns.get(principal_id) ?? [];
    const argPattern = this.extractArgumentPattern(args);
    const existingPattern = this.findMatchingPattern(
      principalPatterns,
      tool_name,
      argPattern
    );

    if (existingPattern) {
      // Update existing pattern
      return this.updatePattern(existingPattern, success);
    } else {
      // Create new pattern
      const newPattern = this.createPattern(
        principal_id,
        tool_name,
        argPattern,
        success,
        risk
      );
      principalPatterns.push(newPattern);

      // Enforce max patterns limit
      if (principalPatterns.length > this.config.maxPatternsPerPrincipal) {
        this.pruneOldPatterns(principalPatterns);
      }

      this.patterns.set(principal_id, principalPatterns);
      return newPattern;
    }
  }

  /**
   * Update existing pattern with new usage.
   */
  private updatePattern(pattern: ToolPattern, success: boolean): ToolPattern {
    const newFrequency = pattern.frequency + 1;
    const newSuccessRate =
      (pattern.success_rate * pattern.frequency + (success ? 1 : 0)) / newFrequency;

    pattern.frequency = newFrequency;
    pattern.success_rate = newSuccessRate;
    pattern.last_used = new Date();
    pattern.auto_approve_eligible =
      newFrequency >= this.config.minFrequencyForAutoApprove &&
      newSuccessRate >= this.config.minSuccessRateForAutoApprove;

    this.log.debug('Pattern updated', {
      id: pattern.id,
      frequency: newFrequency,
      successRate: newSuccessRate.toFixed(2),
      autoApprove: pattern.auto_approve_eligible,
    });

    return pattern;
  }

  /**
   * Create new pattern from usage.
   */
  private createPattern(
    principal_id: string,
    tool_name: string,
    argument_pattern: Record<string, ArgumentPattern>,
    success: boolean,
    risk: ToolRisk
  ): ToolPattern {
    const now = new Date();
    const pattern: ToolPattern = {
      id: crypto.randomUUID(),
      tool_name,
      argument_pattern,
      frequency: 1,
      success_rate: success ? 1 : 0,
      auto_approve_eligible: false, // Never auto-approve on first use
      risk,
      first_seen: now,
      last_used: now,
      principal_id,
    };

    this.log.debug('New pattern created', {
      id: pattern.id,
      tool: tool_name,
      principal: principal_id.slice(0, 8),
    });

    return pattern;
  }

  // ===========================================================================
  // Auto-Approve Check
  // ===========================================================================

  /**
   * Check if tool call matches an auto-approve pattern.
   */
  checkAutoApprove(
    principal_id: string,
    tool_name: string,
    args: Record<string, unknown>
  ): { eligible: boolean; pattern?: ToolPattern; reason?: string } {
    const principalPatterns = this.patterns.get(principal_id) ?? [];
    const argPattern = this.extractArgumentPattern(args);
    const matchingPattern = this.findMatchingPattern(
      principalPatterns,
      tool_name,
      argPattern
    );

    if (!matchingPattern) {
      return {
        eligible: false,
        reason: 'No matching pattern found',
      };
    }

    if (!matchingPattern.auto_approve_eligible) {
      return {
        eligible: false,
        pattern: matchingPattern,
        reason: `Pattern exists but not eligible (frequency: ${matchingPattern.frequency}, success: ${(matchingPattern.success_rate * 100).toFixed(0)}%)`,
      };
    }

    return {
      eligible: true,
      pattern: matchingPattern,
      reason: 'Pattern is auto-approve eligible',
    };
  }

  // ===========================================================================
  // Pattern Matching
  // ===========================================================================

  /**
   * Find matching pattern for given tool and arguments.
   */
  private findMatchingPattern(
    patterns: ToolPattern[],
    tool_name: string,
    argPattern: Record<string, ArgumentPattern>
  ): ToolPattern | undefined {
    return patterns.find((p) => {
      if (p.tool_name !== tool_name) return false;
      return this.matchesArgumentPattern(argPattern, p.argument_pattern);
    });
  }

  /**
   * Check if arguments match a pattern.
   */
  private matchesArgumentPattern(
    actual: Record<string, ArgumentPattern>,
    pattern: Record<string, ArgumentPattern>
  ): boolean {
    // Pattern keys must be subset of actual
    for (const key of Object.keys(pattern)) {
      const patternArg = pattern[key];
      const actualArg = actual[key];

      if (!patternArg || !actualArg) {
        continue; // Skip if key not in both
      }

      if (!this.matchesSingleArgument(actualArg, patternArg)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Match single argument pattern.
   */
  private matchesSingleArgument(
    actual: ArgumentPattern,
    pattern: ArgumentPattern
  ): boolean {
    switch (pattern.type) {
      case 'exact':
        return actual.value === pattern.value;

      case 'prefix':
        // Pattern: "owner/*" matches "owner/repo1", "owner/repo2"
        const prefix = pattern.value.replace('*', '');
        return actual.value.startsWith(prefix);

      case 'suffix':
        const suffix = pattern.value.replace('*', '');
        return actual.value.endsWith(suffix);

      case 'domain':
        // Pattern: "*@company.com" matches "user@company.com"
        const domain = pattern.value.replace('*', '');
        return actual.value.endsWith(domain);

      case 'any':
        return true;

      default:
        return false;
    }
  }

  // ===========================================================================
  // Pattern Extraction
  // ===========================================================================

  /**
   * Extract argument pattern from raw arguments.
   */
  private extractArgumentPattern(
    args: Record<string, unknown>
  ): Record<string, ArgumentPattern> {
    const pattern: Record<string, ArgumentPattern> = {};

    for (const [key, value] of Object.entries(args)) {
      if (typeof value === 'string') {
        pattern[key] = this.extractStringPattern(value);
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        pattern[key] = { type: 'exact', value: String(value) };
      }
      // Skip complex types (arrays, objects)
    }

    return pattern;
  }

  /**
   * Extract pattern from string value.
   */
  private extractStringPattern(value: string): ArgumentPattern {
    // Email domain pattern
    if (value.includes('@')) {
      const domain = value.split('@')[1];
      return { type: 'domain', value: `*@${domain}` };
    }

    // Repository pattern (owner/repo)
    if (value.includes('/') && !value.startsWith('/')) {
      const prefix = value.split('/')[0];
      return { type: 'prefix', value: `${prefix}/*` };
    }

    // File extension pattern
    if (value.startsWith('.') || /\.[a-z]{2,4}$/.test(value)) {
      const ext = value.match(/\.[a-z]{2,4}$/)?.[0] ?? value;
      return { type: 'suffix', value: `*${ext}` };
    }

    // Default to exact match for short values, prefix for longer
    if (value.length <= 20) {
      return { type: 'exact', value };
    }

    return { type: 'prefix', value: value.slice(0, 20) + '*' };
  }

  // ===========================================================================
  // Pattern Management
  // ===========================================================================

  /**
   * Prune old/low-frequency patterns.
   */
  private pruneOldPatterns(patterns: ToolPattern[]): void {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.config.patternRetentionDays);

    // Sort by (frequency * recency), remove lowest
    patterns.sort((a, b) => {
      const scoreA = a.frequency * (a.last_used.getTime() / Date.now());
      const scoreB = b.frequency * (b.last_used.getTime() / Date.now());
      return scoreB - scoreA;
    });

    // Keep only maxPatternsPerPrincipal
    patterns.splice(this.config.maxPatternsPerPrincipal);
  }

  /**
   * Get patterns for a principal.
   */
  getPatterns(principal_id: string): ToolPattern[] {
    return this.patterns.get(principal_id) ?? [];
  }

  /**
   * Get auto-approve eligible patterns.
   */
  getAutoApprovePatterns(principal_id: string): ToolPattern[] {
    const patterns = this.patterns.get(principal_id) ?? [];
    return patterns.filter((p) => p.auto_approve_eligible);
  }

  /**
   * Get pattern statistics for a principal.
   */
  getStats(principal_id: string): {
    totalPatterns: number;
    autoApprovePatterns: number;
    topTools: Array<{ tool: string; frequency: number }>;
    averageSuccessRate: number;
  } {
    const patterns = this.patterns.get(principal_id) ?? [];

    if (patterns.length === 0) {
      return {
        totalPatterns: 0,
        autoApprovePatterns: 0,
        topTools: [],
        averageSuccessRate: 0,
      };
    }

    // Count by tool
    const toolCounts = new Map<string, number>();
    for (const p of patterns) {
      const count = toolCounts.get(p.tool_name) ?? 0;
      toolCounts.set(p.tool_name, count + p.frequency);
    }

    const topTools = Array.from(toolCounts.entries())
      .map(([tool, frequency]) => ({ tool, frequency }))
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 5);

    const avgSuccess =
      patterns.reduce((sum, p) => sum + p.success_rate, 0) / patterns.length;

    return {
      totalPatterns: patterns.length,
      autoApprovePatterns: patterns.filter((p) => p.auto_approve_eligible).length,
      topTools,
      averageSuccessRate: avgSuccess,
    };
  }

  /**
   * Get tool preference model for a principal.
   */
  getPreferenceModel(principal_id: string): ToolPreferenceModel {
    const patterns = this.patterns.get(principal_id) ?? [];

    // Group tools by category
    const preferred_tools = new Map<string, string[]>();
    const categoryMap: Record<string, string> = {
      'github': 'issues',
      'gmail': 'email',
      'google_calendar': 'calendar',
      'slack': 'messaging',
      'shell': 'system',
    };

    for (const p of patterns) {
      const app = p.tool_name.split('.')[0] ?? 'other';
      const category = categoryMap[app] ?? 'other';
      const tools = preferred_tools.get(category) ?? [];
      if (!tools.includes(p.tool_name)) {
        tools.push(p.tool_name);
      }
      preferred_tools.set(category, tools);
    }

    // Infer approval speed from pattern
    const autoApproveRatio =
      patterns.filter((p) => p.auto_approve_eligible).length / Math.max(patterns.length, 1);

    return {
      preferred_tools,
      approval_speed: autoApproveRatio > 0.5 ? 'fast' : 'careful',
      risk_tolerance: this.inferRiskTolerance(patterns),
      common_workflows: this.inferWorkflows(patterns),
      auto_approve_threshold: this.config.minFrequencyForAutoApprove,
    };
  }

  /**
   * Infer risk tolerance from patterns.
   */
  private inferRiskTolerance(patterns: ToolPattern[]): 'low' | 'medium' | 'high' {
    const riskCounts = { READ: 0, WRITE: 0, DESTRUCTIVE: 0 };
    for (const p of patterns) {
      if (p.risk === 'READ') riskCounts.READ += p.frequency;
      else if (p.risk === 'WRITE') riskCounts.WRITE += p.frequency;
      else if (p.risk === 'DESTRUCTIVE') riskCounts.DESTRUCTIVE += p.frequency;
    }

    const total = riskCounts.READ + riskCounts.WRITE + riskCounts.DESTRUCTIVE;
    if (total === 0) return 'medium';

    const writeRatio = (riskCounts.WRITE + riskCounts.DESTRUCTIVE) / total;
    if (writeRatio > 0.5) return 'high';
    if (writeRatio > 0.2) return 'medium';
    return 'low';
  }

  /**
   * Infer common workflows from patterns.
   */
  private inferWorkflows(patterns: ToolPattern[]): string[] {
    const workflows: string[] = [];

    // Check for common workflow patterns
    const tools = patterns.map((p) => p.tool_name);

    if (tools.includes('github.create_issue')) {
      workflows.push('Create GitHub issue from bug report');
    }
    if (tools.includes('google_calendar.create_event')) {
      workflows.push('Schedule meeting with attendees');
    }
    if (tools.includes('gmail.send_message')) {
      workflows.push('Send status update email');
    }
    if (tools.includes('slack.send_message')) {
      workflows.push('Send Slack notification');
    }

    return workflows;
  }

  /**
   * Clear all patterns (for testing).
   */
  clearPatterns(): void {
    this.patterns.clear();
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create tool pattern recognizer.
 */
export function createToolPatternRecognizer(
  config?: ToolPatternConfig
): ToolPatternRecognizer {
  return new ToolPatternRecognizer(config);
}
