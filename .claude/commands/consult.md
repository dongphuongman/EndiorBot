---
description: Query multiple AI models for expert opinions
argument-hint: query or question
allowed-tools: ["Bash"]
model: sonnet
---

# Multi-Model Consultation

**THIN CLIENT**: Calls EndiorBot gateway for multi-model orchestration.

```bash
! ./endiorbot.mjs consult "$ARGUMENTS"
```

EndiorBot gateway will:
1. Classify task type (architecture/security/code_review/research)
2. Select expert panel (Claude + GPT + Gemini + Mistral)
3. Query models in parallel
4. Consolidate responses
5. Return consensus + disagreements + SDLC compliance

Output format:
- RECOMMENDATION: [summary]
- CONSENSUS: [agreements]
- CONCERNS: [disagreements]
- SDLC: [compliance status]

All orchestration logic in `src/agents/multi-model/` (SSOT).
