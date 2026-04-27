/**
 * Experts Page - AI provider configuration & multi-model consultation panel
 */

import { useEffect, useState } from "react";

interface ProviderInfo {
  id: string;
  name: string;
  configured: boolean;
  tier: 1 | 2 | 3;
  tierLabel: string;
  description: string;
}

interface ExpertsResult {
  providers: ProviderInfo[];
}

// Safe IPC helper — works with nodeIntegration:true (no preload needed)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _ipc: any = null;
function getIpc() {
  if (_ipc) return _ipc;
  try { _ipc = require("electron").ipcRenderer; } catch { /* not in Electron */ }
  return _ipc;
}
const safeIpcInvoke = async (channel: string): Promise<unknown> => {
  const ipc = getIpc();
  return ipc ? ipc.invoke(channel) : null;
};

// Sprint 147 T4: tier → design-token CSS class
const TIER_CLASS: Record<1 | 2 | 3, string> = { 1: "t1", 2: "t2", 3: "t3" };

export function ExpertsPage() {
  const [result, setResult] = useState<ExpertsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await safeIpcInvoke("experts:providers");
        if (data && typeof data === "object" && "providers" in data) {
          setResult(data as ExpertsResult);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load providers");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const providers = result?.providers ?? [];
  const configuredCount = providers.filter((p) => p.configured).length;

  return (
    <div>
      {/* Sprint 147 T4: design-token aligned */}
      <div className="page-header">
        <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
          <h1>Experts</h1>
          {!loading && providers.length > 0 && (
            <span className={`gate-chip ${configuredCount > 0 ? "pass" : "pending"}`}>
              {configuredCount}/{providers.length} configured
            </span>
          )}
        </div>
        <p className="subtitle">AI provider status for multi-model consultation</p>
      </div>

      {loading && <p className="muted">Loading providers...</p>}

      {error && (
        <div className="card" style={{ borderColor: "var(--danger)", marginBottom: 16 }}>
          <span style={{ color: "var(--danger)" }}>{error}</span>
        </div>
      )}

      {!loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {providers.map((provider) => (
            <div key={provider.id} className="card" style={{ padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <span className={`dot ${provider.configured ? "ok" : "idle"}`} style={{ width: 10, height: 10 }} />
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                    <span style={{ fontSize: 16, fontWeight: 600 }}>{provider.name}</span>
                    <span className={`tier-pill ${TIER_CLASS[provider.tier]}`}>{provider.tierLabel}</span>
                  </div>
                  <p className="dim" style={{ fontSize: 13, margin: 0 }}>{provider.description}</p>
                </div>
              </div>
              <span className="eyebrow" style={{ color: provider.configured ? "var(--term)" : "var(--ink-3)" }}>
                {provider.configured ? "Ready" : "Not set"}
              </span>
            </div>
          ))}
        </div>
      )}

      <div style={{
        padding: "12px 16px",
        background: "rgba(255,255,255,0.04)",
        borderRadius: "8px",
        fontSize: "13px",
        color: "#6b7280",
      }}>
        Run{" "}
        <code style={{ background: "rgba(255,255,255,0.08)", padding: "2px 6px", borderRadius: "4px", color: "#a5b4fc" }}>
          endiorbot @consult &quot;query&quot;
        </code>
        {" "}for multi-model consultation across configured providers.
      </div>
    </div>
  );
}
