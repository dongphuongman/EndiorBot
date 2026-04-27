/**
 * Provider Circuit Breaker (Sprint 144 T2)
 *
 * Tracks consecutive failures per provider. After N failures, marks
 * the provider as "open" (skip immediately) for a cooldown period.
 * After cooldown, enters "half-open" — one request allowed to test
 * recovery. On success → close; on failure → re-open (extended).
 *
 * Pattern reused from Active Memory circuit breaker (Sprint 133 S1).
 *
 * CEO use case: CC Bridge times out twice → 3rd @agent call skips CC
 * immediately → Kimi responds in <30s instead of wasting 180s.
 *
 * @module agents/router/provider-circuit-breaker
 * @version 1.0.0
 * @date 2026-04-27
 * @status ACTIVE — Sprint 144 T2
 */

// ============================================================================
// Types
// ============================================================================

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface CircuitStatus {
  state: CircuitState;
  failures: number;
  lastFailure: number;
  openedAt: number;
  cooldownMs: number;
}

// ============================================================================
// Configuration
// ============================================================================

/** Failures before circuit opens */
const FAILURE_THRESHOLD = 2;

/** Initial cooldown (ms) when circuit opens */
const INITIAL_COOLDOWN_MS = 60_000; // 60s

/** Extended cooldown multiplier is applied via cooldownMs * 2 in recordProviderFailure */

/** Max cooldown cap */
const MAX_COOLDOWN_MS = 300_000; // 5 min

// ============================================================================
// Circuit Breaker
// ============================================================================

const circuits = new Map<string, CircuitStatus>();

/**
 * Check if a provider should be skipped (circuit is open).
 * Returns true if provider is available (CLOSED or HALF_OPEN).
 * Returns false if provider should be skipped (OPEN, cooldown not expired).
 */
export function isProviderAvailable(providerId: string): boolean {
  const circuit = circuits.get(providerId);
  if (!circuit) return true; // No circuit = never failed = available

  switch (circuit.state) {
    case "CLOSED":
      return true;
    case "HALF_OPEN":
      return true; // Allow one test request
    case "OPEN": {
      // Check if cooldown expired → transition to HALF_OPEN
      const elapsed = Date.now() - circuit.openedAt;
      if (elapsed >= circuit.cooldownMs) {
        circuit.state = "HALF_OPEN";
        return true;
      }
      return false; // Still cooling down
    }
  }
}

/**
 * Record a successful provider call. Closes the circuit.
 */
export function recordProviderSuccess(providerId: string): void {
  const circuit = circuits.get(providerId);
  if (!circuit) return; // Never failed, nothing to do

  // Reset on success
  circuit.state = "CLOSED";
  circuit.failures = 0;
}

/**
 * Record a provider failure. May open the circuit.
 */
export function recordProviderFailure(providerId: string): void {
  let circuit = circuits.get(providerId);
  if (!circuit) {
    circuit = {
      state: "CLOSED",
      failures: 0,
      lastFailure: 0,
      openedAt: 0,
      cooldownMs: INITIAL_COOLDOWN_MS,
    };
    circuits.set(providerId, circuit);
  }

  circuit.failures++;
  circuit.lastFailure = Date.now();

  if (circuit.state === "HALF_OPEN") {
    // Half-open test failed → re-open with extended cooldown
    circuit.state = "OPEN";
    circuit.openedAt = Date.now();
    circuit.cooldownMs = Math.min(circuit.cooldownMs * 2, MAX_COOLDOWN_MS);
    return;
  }

  if (circuit.failures >= FAILURE_THRESHOLD) {
    // Threshold breached → open circuit
    circuit.state = "OPEN";
    circuit.openedAt = Date.now();
    circuit.cooldownMs = INITIAL_COOLDOWN_MS;
  }
}

/**
 * Get the current status of a provider's circuit (for diagnostics).
 */
export function getCircuitStatus(providerId: string): CircuitStatus | undefined {
  return circuits.get(providerId);
}

/**
 * Reset all circuits (called on serve restart — fresh state).
 */
export function resetAllCircuits(): void {
  circuits.clear();
}

/**
 * Get summary of all open circuits (for logging/diagnostics).
 */
export function getOpenCircuits(): Array<{ providerId: string; status: CircuitStatus }> {
  const open: Array<{ providerId: string; status: CircuitStatus }> = [];
  for (const [id, status] of circuits) {
    if (status.state === "OPEN") {
      open.push({ providerId: id, status });
    }
  }
  return open;
}
