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
    <div>
      {/* Sprint 147 T4: design-token aligned */}
      <div className="page-header">
        <h1>Projects</h1>
        <p className="subtitle">Registered project workspaces ({repos.length} projects)</p>
      </div>

      {loading && <p className="muted">Loading projects...</p>}

      {error && (
        <div className="card" style={{ borderColor: "var(--danger)", marginBottom: 16 }}>
          <span style={{ color: "var(--danger)" }}>{error}</span>
        </div>
      )}

      {!loading && repos.length === 0 && !error && (
        <div className="card" style={{ padding: 40, textAlign: "center" }}>
          <p style={{ fontSize: 48, marginBottom: 16 }}>📭</p>
          <h2 style={{ fontSize: 20, marginBottom: 8 }}>No projects registered</h2>
          <p className="muted" style={{ fontSize: 14 }}>
            Register a project via CLI:{" "}
            <code className="mono" style={{ background: "var(--bg-2)", padding: "2px 6px", borderRadius: 4 }}>
              endiorbot repos add &lt;name&gt; /path/to/project
            </code>
          </p>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {repos.map((repo) => (
          <div key={repo.name} className="card" style={{ padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                <span className={`dot ${repo.exists ? "ok" : "fail"}`} />
                <span style={{ fontSize: 18, fontWeight: 600 }}>{repo.name}</span>
                <span className="tier-pill t3">{repo.defaultBranch}</span>
              </div>
              <p className="mono dim" style={{ fontSize: 13, margin: 0 }}>{repo.path}</p>
            </div>
            <span className="dim" style={{ fontSize: 12 }}>
              {repo.registeredAt ? new Date(repo.registeredAt).toLocaleDateString() : "—"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
