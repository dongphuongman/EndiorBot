/**
 * Envelope Builder
 *
 * Assembles a complete SessionIntelligenceEnvelope from persona + brain + context
 * and serializes it for file-based injection into agent sessions.
 *
 * @module bridge/intelligence/envelope-builder
 * @version 1.0.0
 * @date 2026-03-07
 * @authority ADR-025 Session Intelligence Envelope
 * @stage 04 - BUILD (Sprint 87)
 */

import { loadBrainL4 } from "./brain-loader.js";
import { buildContextEnvelope, enrichWithCRG } from "./context-builder.js";
import type {
  PersonaEnvelope,
  SessionIntelligenceEnvelope,
} from "./envelope.js";

/**
 * Optional CRG enrichment parameters (Sprint 131, ADR-045).
 * When provided, blast radius is queried for graph-aware agents.
 */
export interface CRGEnrichmentOptions {
  repoId: string;
  changedFiles: string[];
}

// ============================================================================
// Builder
// ============================================================================

/**
 * Build a complete SessionIntelligenceEnvelope.
 *
 * Assembles persona (required) + brain (optional) + context (optional).
 * Brain and context are loaded from their respective stores.
 * Missing layers are silently omitted (no error).
 *
 * Sprint 131 (ADR-045): Optional CRG enrichment for graph-aware agents.
 * When `crgOptions` is provided and the persona's agentRole is in the
 * graph-aware set (reviewer, architect, coder, tester), the context
 * envelope is enriched with blast radius from AI-Platform CRG service.
 * Fail-soft: errors are swallowed, envelope returned unchanged.
 */
export async function buildFullEnvelope(
  persona: PersonaEnvelope,
  crgOptions?: CRGEnrichmentOptions,
): Promise<SessionIntelligenceEnvelope> {
  const envelope: SessionIntelligenceEnvelope = { persona };

  // Load Brain L4 (optional — null if no models or error)
  const brain = loadBrainL4();
  if (brain) {
    envelope.brain = brain;
  }

  // Load Context (optional — null if no active project or error)
  let context = await buildContextEnvelope();

  // Sprint 131: CRG enrichment for graph-aware agents
  if (context && crgOptions && crgOptions.changedFiles.length > 0) {
    context = await enrichWithCRG(
      context,
      persona.agentRole,
      crgOptions.repoId,
      crgOptions.changedFiles,
    );
  }

  if (context) {
    envelope.context = context;
  }

  return envelope;
}

/**
 * Serialize brain + context sections for file-based injection.
 *
 * Produces a markdown string suitable for --append-system-prompt-file
 * or appending to an existing SOUL temp file.
 *
 * Returns empty string if neither brain nor context is available.
 * Persona is NOT included — it's handled separately by Strategy A/B.
 */
export function serializeEnvelopeForInjection(
  envelope: SessionIntelligenceEnvelope,
): string {
  const sections: string[] = [];

  if (envelope.brain) {
    sections.push(envelope.brain.content);
  }

  if (envelope.context) {
    sections.push(envelope.context.content);

    // Sprint 131 (ADR-045): CRG graph context appended after project context
    if (envelope.context.graphContext) {
      sections.push(
        `[Code Graph Context — CRG]\n${envelope.context.graphContext}\n[End Code Graph Context]`,
      );
    }
  }

  if (sections.length === 0) return "";

  return sections.join("\n\n");
}
