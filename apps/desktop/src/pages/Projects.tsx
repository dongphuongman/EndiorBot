/**
 * Projects Page - Registered project workspaces
 */

import { useEffect, useState } from "react";

interface RepoInfo {
  name: string;
  path: string;
  registeredAt?: string;
  defaultBranch: string;
  exists: boolean;
}

// Safe IPC helper — works with nodeIntegration:true (no preload needed)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _ipc: any = null;
function getIpc() {
  if (_ipc) return _ipc;
  try { _ipc = require("electron").ipcRenderer; } catch { /* not in Electron */ }
  return _ipc;
}
const safeIpcInvoke = async (channel: string) => {
  const ipc = getIpc();
  return ipc ? ipc.invoke(channel) : null;
};

export function ProjectsPage() {
  const [repos, setRepos] = useState<RepoInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const result = await safeIpcInvoke("repos:list");
        if (result?.repos) {
          setRepos(result.repos);
        }
        if (result?.error) {
          setError(result.error);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load repos");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div style={{ padding: "20px" }}>
      <h1 style={{ fontSize: "32px", marginBottom: "8px" }}>📁 Projects</h1>
      <p style={{ color: "#9ca3af", marginBottom: "24px" }}>
        Registered project workspaces ({repos.length} projects)
      </p>

      {loading && (
        <p style={{ color: "#9ca3af" }}>Loading projects...</p>
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

      {!loading && repos.length === 0 && !error && (
        <div style={{
          padding: "40px",
          background: "rgba(255, 255, 255, 0.05)",
          borderRadius: "12px",
          textAlign: "center",
        }}>
          <p style={{ fontSize: "48px", marginBottom: "16px" }}>📭</p>
          <h2 style={{ fontSize: "20px", marginBottom: "8px", color: "#e5e7eb" }}>No projects registered</h2>
          <p style={{ color: "#9ca3af", fontSize: "14px" }}>
            Register a project via CLI:{" "}
            <code style={{ background: "rgba(255,255,255,0.1)", padding: "2px 6px", borderRadius: "4px" }}>
              endiorbot repos add &lt;name&gt; /path/to/project
            </code>
          </p>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {repos.map((repo) => (
          <div
            key={repo.name}
            style={{
              padding: "16px 20px",
              background: "rgba(255, 255, 255, 0.05)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: "12px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
                <span style={{
                  display: "inline-block",
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  background: repo.exists ? "#22c55e" : "#ef4444",
                }} />
                <span style={{ fontSize: "18px", fontWeight: 600, color: "#f3f4f6" }}>
                  {repo.name}
                </span>
                <span style={{
                  fontSize: "11px",
                  padding: "2px 8px",
                  borderRadius: "9999px",
                  background: "rgba(99, 102, 241, 0.15)",
                  color: "#a5b4fc",
                }}>
                  {repo.defaultBranch}
                </span>
              </div>
              <p style={{ fontSize: "13px", color: "#6b7280", fontFamily: "monospace" }}>
                {repo.path}
              </p>
            </div>
            <div style={{ textAlign: "right", fontSize: "12px", color: "#6b7280" }}>
              {repo.registeredAt
                ? new Date(repo.registeredAt).toLocaleDateString()
                : "—"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
