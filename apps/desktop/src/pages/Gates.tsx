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

const STATUS_STYLES: Record<GateInfo["status"], { bg: string; border: string; color: string; label: string }> = {
  pass: { bg: "rgba(34, 197, 94, 0.12)", border: "rgba(34, 197, 94, 0.35)", color: "#4ade80", label: "PASS" },
  fail: { bg: "rgba(239, 68, 68, 0.12)", border: "rgba(239, 68, 68, 0.35)", color: "#f87171", label: "FAIL" },
  pending: { bg: "rgba(255, 255, 255, 0.05)", border: "rgba(255, 255, 255, 0.08)", color: "#9ca3af", label: "PENDING" },
  skipped: { bg: "rgba(99, 102, 241, 0.08)", border: "rgba(99, 102, 241, 0.2)", color: "#a5b4fc", label: "SKIPPED" },
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
    <div style={{ padding: "20px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: "16px", marginBottom: "8px" }}>
        <h1 style={{ fontSize: "32px", margin: 0 }}>Gates</h1>
        {!loading && totalCount > 0 && (
          <span style={{
            fontSize: "13px",
            padding: "3px 10px",
            borderRadius: "9999px",
            background: passCount === totalCount ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.07)",
            color: passCount === totalCount ? "#4ade80" : "#9ca3af",
          }}>
            {passCount}/{totalCount} passed
          </span>
        )}
      </div>

      <p style={{ color: "#9ca3af", marginBottom: "8px" }}>
        SDLC gate status for the current project
      </p>

      {result?.tier && (
        <p style={{ fontSize: "12px", color: "#6b7280", marginBottom: "24px" }}>
          Tier: <strong style={{ color: "#a5b4fc" }}>{result.tier}</strong>
          {result.frameworkVersion && (
            <> &nbsp;&middot;&nbsp; Framework: <strong style={{ color: "#a5b4fc" }}>v{result.frameworkVersion}</strong></>
          )}
          {" "}&nbsp;&middot;&nbsp; Source: <em>{result.source}</em>
        </p>
      )}

      {!result?.tier && !loading && (
        <p style={{ fontSize: "12px", color: "#6b7280", marginBottom: "24px" }}>
          Source: <em>{result?.source ?? "static"}</em>
        </p>
      )}

      {loading && (
        <p style={{ color: "#9ca3af" }}>Loading gate status...</p>
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
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: "14px",
          marginBottom: "24px",
        }}>
          {gates.map((gate) => {
            const s = STATUS_STYLES[gate.status];
            return (
              <div
                key={gate.id}
                style={{
                  padding: "20px",
                  background: s.bg,
                  border: `1px solid ${s.border}`,
                  borderRadius: "12px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
                  <span style={{
                    fontSize: "20px",
                    fontWeight: 700,
                    color: "#f3f4f6",
                    fontFamily: "monospace",
                  }}>
                    {gate.id}
                  </span>
                  <span style={{
                    fontSize: "11px",
                    fontWeight: 600,
                    padding: "2px 8px",
                    borderRadius: "9999px",
                    background: s.border,
                    color: s.color,
                    letterSpacing: "0.04em",
                  }}>
                    {s.label}
                  </span>
                </div>
                <p style={{ fontSize: "13px", color: "#d1d5db", margin: 0, marginBottom: "8px" }}>
                  {gate.name}
                </p>
                {gate.lastChecked && (
                  <p style={{ fontSize: "11px", color: "#6b7280", margin: 0 }}>
                    {new Date(gate.lastChecked).toLocaleString()}
                  </p>
                )}
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
          endiorbot gate status
        </code>
        {" "}for detailed evidence and per-gate checks.
      </div>
    </div>
  );
}
