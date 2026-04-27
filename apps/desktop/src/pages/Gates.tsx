/**
 * Gates Page - SDLC gate status & approval
 */

import { useEffect, useState } from "react";

interface GateInfo {
  id: string;
  name: string;
  status: "pass" | "fail" | "pending" | "skipped";
  lastChecked: string | null;
}

interface GatesResult {
  gates: GateInfo[];
  tier: string | null;
  frameworkVersion: string | null;
  source: "core" | "sdlc-config" | "static";
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

// Sprint 147 T4: map gate status to design-token CSS classes
const STATUS_CLASS: Record<GateInfo["status"], string> = {
  pass: "pass",
  fail: "fail",
  pending: "pending",
  skipped: "pending",
};
const STATUS_LABEL: Record<GateInfo["status"], string> = {
  pass: "PASS",
  fail: "FAIL",
  pending: "PENDING",
  skipped: "SKIPPED",
};

export function GatesPage() {
  const [result, setResult] = useState<GatesResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await safeIpcInvoke("gates:status");
        if (data && typeof data === "object" && "gates" in data) {
          setResult(data as GatesResult);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load gate status");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const gates = result?.gates ?? [];
  const passCount = gates.filter((g) => g.status === "pass").length;
  const totalCount = gates.length;

  return (
    <div>
      {/* Sprint 147 T4: design-token aligned */}
      <div className="page-header">
        <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
          <h1>Gates</h1>
          {!loading && totalCount > 0 && (
            <span className={`gate-chip ${passCount === totalCount ? "pass" : "pending"}`}>
              {passCount}/{totalCount} passed
            </span>
          )}
        </div>
        <p className="subtitle">
          SDLC gate status for the current project
          {result?.tier && <> &middot; Tier: <strong style={{ color: "var(--violet)" }}>{result.tier}</strong></>}
          {result?.frameworkVersion && <> &middot; v{result.frameworkVersion}</>}
        </p>
      </div>

      {loading && <p className="muted">Loading gate status...</p>}

      {error && (
        <div className="card" style={{ borderColor: "var(--danger)", marginBottom: 16 }}>
          <span style={{ color: "var(--danger)" }}>{error}</span>
        </div>
      )}

      {!loading && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14 }}>
          {gates.map((gate) => (
            <div key={gate.id} className="card" style={{ padding: 20 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <span className="mono" style={{ fontSize: 20, fontWeight: 700 }}>{gate.id}</span>
                <span className={`gate-chip ${STATUS_CLASS[gate.status]}`}>{STATUS_LABEL[gate.status]}</span>
              </div>
              <p style={{ fontSize: 13, color: "var(--ink-2)", margin: "0 0 8px" }}>{gate.name}</p>
              {gate.lastChecked && (
                <p className="dim" style={{ fontSize: 11, margin: 0 }}>{new Date(gate.lastChecked).toLocaleString()}</p>
              )}
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
          endiorbot gate status
        </code>
        {" "}for detailed evidence and per-gate checks.
      </div>
    </div>
  );
}
