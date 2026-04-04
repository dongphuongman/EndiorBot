/**
 * Fact Store
 *
 * Entity-relation-value structured fact storage with conflict resolution.
 * Per-project JSONL persistence at ~/.endiorbot/memory/{projectId}/facts.jsonl.
 *
 * Adapted from ClawVault's FactStore (src/lib/fact-store.ts).
 *
 * @module memory/fact-store
 * @version 1.0.0
 * @date 2026-03-11
 * @status ACTIVE - Sprint 101
 * @origin ClawVault v3.2.0 (src/lib/fact-store.ts)
 */

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
import type { StructuredFact, FactQueryFilter } from "./types.js";

// ============================================================================
// Constants
// ============================================================================

/** Base directory for memory storage. */
const MEMORY_BASE_DIR = join(homedir(), ".endiorbot", "memory");

// ============================================================================
// FactStore
// ============================================================================

/**
 * Structured fact store with conflict resolution.
 *
 * - Append-only JSONL persistence (per-project)
 * - In-memory indices for fast lookup by entity and relation
 * - Conflict resolution: same entity+relation → mark old validUntil, add new
 *
 * Storage: ~/.endiorbot/memory/{projectId}/facts.jsonl
 */
export class FactStore {
  private readonly projectId: string;
  private readonly filePath: string;
  private facts: StructuredFact[] = [];
  private byEntity: Map<string, Set<number>> = new Map();
  private byRelation: Map<string, Set<number>> = new Map();

  constructor(projectId: string) {
    this.projectId = projectId;
    const projectDir = join(MEMORY_BASE_DIR, projectId);
    this.filePath = join(projectDir, "facts.jsonl");
  }

  /**
   * Load facts from JSONL file.
   * Skips malformed lines with a warning.
   * CTO F3: Uses async fs/promises instead of sync readFileSync.
   */
  async load(): Promise<void> {
    this.facts = [];
    this.byEntity = new Map();
    this.byRelation = new Map();

    if (!existsSync(this.filePath)) return;

    const content = await readFile(this.filePath, "utf-8");
    const lines = content.split("\n").filter((line) => line.trim());

    for (const line of lines) {
      try {
        const fact = JSON.parse(line) as StructuredFact;
        this.indexFact(fact);
      } catch {
        console.warn(`[FactStore] Skipping malformed JSONL line: ${line.slice(0, 80)}...`);
      }
    }
  }

  /**
   * Add facts with conflict resolution.
   * Same entity+relation → mark old fact's validUntil, add new as current.
   */
  addFacts(newFacts: StructuredFact[]): void {
    for (const fact of newFacts) {
      // Conflict resolution: find existing current fact with same entity+relation
      const existingIndices = this.findByEntityRelation(fact.entity, fact.relation);
      for (const idx of existingIndices) {
        const existing = this.facts[idx];
        if (existing && !existing.validUntil) {
          // Supersede old fact
          existing.validUntil = fact.validFrom;
        }
      }

      this.indexFact(fact);
    }
  }

  /**
   * Replace all facts (used after TTL eviction + max-facts enforcement).
   * Rebuilds indices from scratch.
   */
  replaceAll(facts: StructuredFact[]): void {
    this.facts = [];
    this.byEntity = new Map();
    this.byRelation = new Map();
    for (const fact of facts) {
      this.indexFact(fact);
    }
  }

  /**
   * Query facts by filter.
   * Returns current facts only (validUntil not set) by default.
   */
  query(filter: FactQueryFilter): StructuredFact[] {
    let candidateIndices: Set<number> | null = null;

    if (filter.entity) {
      candidateIndices = this.byEntity.get(filter.entity) ?? new Set();
    }

    if (filter.relation) {
      const relationIndices = this.byRelation.get(filter.relation) ?? new Set();
      if (candidateIndices) {
        // Intersect
        candidateIndices = new Set(
          [...candidateIndices].filter((idx) => relationIndices.has(idx)),
        );
      } else {
        candidateIndices = relationIndices;
      }
    }

    // If no filter, return all current facts
    const indices = candidateIndices ?? new Set(this.facts.map((_, i) => i));

    return [...indices]
      .map((idx) => this.facts[idx])
      .filter((fact): fact is StructuredFact => fact !== undefined && !fact.validUntil);
  }

  /**
   * Save facts to JSONL file.
   * Writes all facts (including superseded ones for audit trail).
   * CTO F3: Uses async fs/promises instead of sync writeFileSync.
   */
  async save(): Promise<void> {
    const dir = join(MEMORY_BASE_DIR, this.projectId);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }

    const content = this.facts.map((fact) => JSON.stringify(fact)).join("\n");
    await writeFile(this.filePath, content + "\n", "utf-8");
  }

  /**
   * Get all facts (including superseded). For testing/inspection.
   */
  getAllFacts(): StructuredFact[] {
    return [...this.facts];
  }

  /**
   * Get the number of current (non-superseded) facts.
   */
  getCurrentFactCount(): number {
    return this.facts.filter((f) => !f.validUntil).length;
  }

  /**
   * Create a new StructuredFact with generated ID and timestamp.
   * Convenience factory method.
   */
  static createFact(
    entity: string,
    relation: string,
    value: string,
    source: string,
    confidence = 0.8,
  ): StructuredFact {
    return {
      id: randomUUID(),
      entity,
      relation,
      value,
      confidence,
      validFrom: new Date().toISOString(),
      source,
    };
  }

  // ==========================================================================
  // Private helpers
  // ==========================================================================

  private indexFact(fact: StructuredFact): void {
    const idx = this.facts.length;
    this.facts.push(fact);

    // Index by entity
    if (!this.byEntity.has(fact.entity)) {
      this.byEntity.set(fact.entity, new Set());
    }
    this.byEntity.get(fact.entity)!.add(idx);

    // Index by relation
    if (!this.byRelation.has(fact.relation)) {
      this.byRelation.set(fact.relation, new Set());
    }
    this.byRelation.get(fact.relation)!.add(idx);
  }

  private findByEntityRelation(entity: string, relation: string): number[] {
    const entityIndices = this.byEntity.get(entity);
    if (!entityIndices) return [];

    return [...entityIndices].filter((idx) => {
      const fact = this.facts[idx];
      return fact && fact.relation === relation;
    });
  }
}
