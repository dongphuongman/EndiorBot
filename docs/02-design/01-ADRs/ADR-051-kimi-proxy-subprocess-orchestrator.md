---
status: ACCEPTED
authority:
  proposer: "@architect"
  countersigners:
    - actor: "@cto"
      date: "2026-04-23"
      grade: ""
      reference: "ceo-directive-2026-04-23"
  trigger: "CEO requires Kimi2.6 as first fallback for all SDLC agents without external proxy management"
  notes: "Subprocess orchestrator pattern selected per CTO review. Full porting rejected due to security and maintenance concerns."
---

# ADR-051: Kimi Proxy Subprocess Orchestrator Integration

## Status
Proposed (awaiting G2 approval)

## Context

CEO has successfully configured `claude-code-proxy` (raine) in the OpenMontage workspace via `start-cc-kimi.sh`, using a Kimi Code subscription (OAuth device flow) to expose Kimi2.6 through an Anthropic-compatible local proxy at `http://127.0.0.1:18765`.

The requirement is to integrate this capability **into EndiorBot runtime** so that:
1. **All SDLC agents** in `docs/reference/templates/souls/` use Kimi2.6 as the **first fallback** after Claude Code.
2. CEO does **not** need to manually run `start-cc-kimi.sh` or manage a separate proxy process.

Three approaches were evaluated:
- **Phương án 1 (Subprocess Orchestrator):** EndiorBot spawns and manages `claude-code-proxy` as a subprocess.
- **Phương án 2 (Internal Proxy Module):** Porting the entire proxy logic (OAuth, SSE translation, thinking blocks) into EndiorBot.
- **Phương án 3 (Direct Kimi API):** Calling `api.kimi.com` directly via API key (does not support Kimi Code subscription).

CTO reviewed and approved **Phương án 1** with conditions. CEO concurred.

## Decision

We will implement a **Subprocess Orchestrator** module within EndiorBot that:

1. **Auto-detects** the `claude-code-proxy` binary in PATH.
2. **Auto-starts** the proxy on a **dynamic port** (to avoid conflicts) when the ChannelRouter initializes.
3. **Registers** a new `kimi-proxy` provider that points to the local proxy endpoint.
4. **Inserts** `kimi-proxy` as the **first fallback** in the cloud fallback chain for **all agents**.
5. **Cleans up** the proxy process on EndiorBot shutdown (SIGTERM).

### Fallback Chain (Updated — CEO Directive 2026-04-23)

```
1. PRIMARY:     Claude Code Bridge (claude CLI)
2. FALLBACK 1:  kimi-proxy (local claude-code-proxy subprocess, Kimi OAuth)
3. FALLBACK 2:  kimi-api (Moonshot direct API, OpenAI-compatible)
4. FALLBACK 3:  OpenAI (Codex / GPT)
5. LAST RESORT: Remote Ollama (AI Platform)
```

**Removed from chain:** Gemini (per CEO directive). Anthropic API key (expensive) also removed.

## Consequences

### Positive
- **Zero manual setup:** Proxy lifecycle is fully managed by EndiorBot.
- **Low risk:** Reuses the battle-tested `claude-code-proxy` binary; minimal new code (~150–200 lines).
- **Security preserved:** OAuth tokens remain managed by the proxy (Keychain/`~/.config/`), not by EndiorBot.
- **Fast delivery:** Estimated 1–2 days vs. 1–2 weeks for full porting.

### Negative
- **External binary dependency:** `claude-code-proxy` must be installed separately (`brew install` or binary download).
- **Process fragility:** Subprocess crash requires auto-restart logic.
- **Port management:** Dynamic port allocation adds complexity to provider registration.

## Conditions (CTO G2 Requirements)

The implementation MUST satisfy all of the following:

| # | Condition | Verification |
|---|-----------|--------------|
| 1 | **Dynamic port:** Proxy binds to a dynamic port (not hardcoded 18765). EndiorBot passes `PORT` env var. | Unit test: port collision handling |
| 2 | **Graceful degrade:** If binary missing or auth invalid → skip silently, do not throw. Fallback chain continues. | Integration test: missing binary path |
| 3 | **Health check timeout:** `/healthz` check ≤ 3s. Never block router init. | Unit test: timeout simulation |
| 4 | **Process cleanup:** Proxy receives SIGTERM on EndiorBot shutdown. No zombie processes. | E2E test: process lifecycle |
| 5 | **Auth pre-check:** Before starting, verify `claude-code-proxy kimi auth status` (or equivalent). Warn if not authenticated. | Integration test: auth status check |
| 6 | **Kill switch:** `ENDIORBOT_DISABLE_KIMI_PROXY=true` bypasses proxy entirely. | Unit test: env flag behavior |

## Alternatives Considered

### Phương án 2: Internal Proxy Module (Full Porting)
- **Rejected:** Porting OAuth device flow, SSE stream translation, thinking blocks reducer, and image URL mapping into EndiorBot would introduce ~2000+ lines of high-maintenance code. Security responsibility for token storage would shift to EndiorBot. Effort (1–2 weeks) does not justify ROI for a local development tool.

### Phương án 3: Direct Kimi API Provider (API Key)
- **Rejected:** Does not support Kimi Code subscription (OAuth). Would require a separate API key, incurring additional cost and losing reasoning blocks. This is a feature regression, not an integration.

## Implementation Notes

### New Module
```
src/providers/kimi-proxy/
  subprocess-orchestrator.ts   # Spawn, health-check, port mgmt, cleanup
  index.ts                     # KimiProxyProvider (existing Anthropic-compatible client)
```

### Changes to Existing Code
- `src/providers/init.ts`: Register `kimi-api` (API key) first, then `kimi-proxy` (OAuth).
- `src/agents/router/providers.ts`: Update `callCloudFallback` preferred order:
  `kimi-api` → `kimi-proxy` → `openai` → `anthropic` (Gemini removed).
- `src/agents/channel-router.ts`: Inject subprocess orchestrator into router lifecycle.
- `.env.example`: Add `KIMI_API_KEY` and `KIMI_API_BASE_URL`.

### SOUL File Updates
All `docs/reference/templates/souls/SOUL-*.md` files updated to document the new fallback model policy.

## References

- `claude-code-proxy` repository: https://github.com/raine/claude-code-proxy
- OpenMontage working setup: `/Users/dttai/Documents/Research/OpenMontage/start-cc-kimi.sh`
- FR-011: Kimi2.6 First Fallback for All SDLC Agents (`docs/01-planning/requirements.md`)
