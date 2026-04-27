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

const TIER_COLORS: Record<1 | 2 | 3, { bg: string; color: string }> = {
  1: { bg: "rgba(168, 85, 247, 0.15)", color: "#c084fc" },
  2: { bg: "rgba(99, 102, 241, 0.15)", color: "#a5b4fc" },
  3: { bg: "rgba(255, 255, 255, 0.07)", color: "#9ca3af" },
};

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
    <div style={{ padding: "20px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: "16px", marginBottom: "8px" }}>
        <h1 style={{ fontSize: "32px", margin: 0 }}>Experts</h1>
        {!loading && providers.length > 0 && (
          <span style={{
            fontSize: "13px",
            padding: "3px 10px",
            borderRadius: "9999px",
            background: configuredCount > 0 ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.07)",
            color: configuredCount > 0 ? "#4ade80" : "#9ca3af",
          }}>
            {configuredCount}/{providers.length} configured
          </span>
        )}
      </div>

      <p style={{ color: "#9ca3af", marginBottom: "24px" }}>
        AI provider status for multi-model consultation (Claude, GPT, Gemini, Kimi, Ollama)
      </p>

      {loading && (
        <p style={{ color: "#9ca3af" }}>Loading providers...</p>
      )}

      {error && (
        <div style={{
          padding: "12px 16px",
          background: "rgba(239, 68, 68, 0.1)",
          border: "1px solid rgba(239, 68, 68, 0.3)",
          borderRadius: "8px",
          color: "#fca5a5",
          marginBottom: "16px",
        }}>
          {error}
        </div>
      )}

      {!loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "24px" }}>
          {providers.map((provider) => {
            const tc = TIER_COLORS[provider.tier];
            return (
              <div
                key={provider.id}
                style={{
                  padding: "16px 20px",
                  background: "rgba(255, 255, 255, 0.05)",
                  border: `1px solid ${provider.configured ? "rgba(34,197,94,0.25)" : "rgba(255,255,255,0.08)"}`,
                  borderRadius: "12px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                  {/* Status dot */}
                  <span style={{
                    display: "inline-block",
                    width: "10px",
                    height: "10px",
                    borderRadius: "50%",
                    background: provider.configured ? "#22c55e" : "#4b5563",
                    flexShrink: 0,
                  }} />

                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
                      <span style={{ fontSize: "16px", fontWeight: 600, color: "#f3f4f6" }}>
                        {provider.name}
                      </span>
                      <span style={{
                        fontSize: "11px",
                        padding: "2px 8px",
                        borderRadius: "9999px",
                        background: tc.bg,
                        color: tc.color,
                        fontWeight: 500,
                      }}>
                        {provider.tierLabel}
                      </span>
                    </div>
                    <p style={{ fontSize: "13px", color: "#6b7280", margin: 0 }}>
                      {provider.description}
                    </p>
                  </div>
                </div>

                <span style={{
                  fontSize: "12px",
                  fontWeight: 600,
                  color: provider.configured ? "#4ade80" : "#6b7280",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}>
                  {provider.configured ? "Ready" : "Not set"}
                </span>
              </div>
            );
          })}
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
