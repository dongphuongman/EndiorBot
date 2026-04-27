/**
 * Dashboard Page - Project overview and system status
 */

import { useState, useEffect } from "react";
import { useSettingsStore } from "../stores/settings.safe";
import { useGatewayStore } from "../stores/gateway.safe";
import { Card, CardHeader, CardTitle, CardContent, Badge } from "../components/ui";

/** Lazy IPC renderer accessor — returns null outside Electron. */
let _ipc: Electron.IpcRenderer | null = null;
function getIpc(): Electron.IpcRenderer | null {
  if (_ipc) return _ipc;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _ipc = (require("electron") as { ipcRenderer: Electron.IpcRenderer }).ipcRenderer;
  } catch {
    // Running in browser / test — no IPC available
  }
  return _ipc;
}

async function safeIpcInvoke<T>(channel: string): Promise<T | null> {
  const ipc = getIpc();
  if (!ipc) return null;
  try {
    return (await ipc.invoke(channel)) as T;
  } catch {
    return null;
  }
}

interface DashboardStats {
  projectCount: string;
  gatePassCount: string;
  providerCount: string;
}

export function Dashboard() {
  const { theme, gatewayPort } = useSettingsStore();
  const { status, isConnected, lastChecked } = useGatewayStore();

  const [stats, setStats] = useState<DashboardStats>({
    projectCount: "—",
    gatePassCount: "—",
    providerCount: "—",
  });

  useEffect(() => {
    let cancelled = false;

    async function loadStats() {
      // Sprint 147 fix (CPO finding): IPC handlers return wrapped objects
      // { repos: [...] }, { gates: [...] }, { providers: [...] }
      const [reposResult, gatesResult, providersResult] = await Promise.all([
        safeIpcInvoke<{ repos: { id: string }[] }>("repos:list"),
        safeIpcInvoke<{ gates: { result: string }[] }>("gates:status"),
        safeIpcInvoke<{ providers: { name: string }[] }>("experts:providers"),
      ]);

      if (cancelled) return;

      const repos = reposResult?.repos;
      const gates = gatesResult?.gates;
      const providers = providersResult?.providers;

      setStats({
        projectCount: repos != null ? String(repos.length) : "—",
        gatePassCount: gates != null
          ? String(gates.filter((g) => g.result === "PASS").length)
          : "—",
        providerCount: providers != null ? String(providers.length) : "—",
      });
    }

    void loadStats();
    return () => { cancelled = true; };
  }, []);

  // Project overview (no sprint-specific info, just status)
  const projectStats = {
    name: "EndiorBot",
    status: "Production Ready",
    version: "1.0.0",
    tier: "STANDARD" as const,
  };

  const systemStatus = [
    { label: "Layout & Routing", status: "operational" as const },
    { label: "Sidebar Navigation", status: "operational" as const },
    { label: "Safe Stores", status: "operational" as const },
    { label: "Gateway Connection", status: isConnected ? ("operational" as const) : ("degraded" as const) },
  ];

  const getStatusBadge = (status: "operational" | "degraded" | "offline") => {
    const variants = {
      operational: "success",
      degraded: "warning",
      offline: "danger",
    } as const;
    return variants[status];
  };

  return (
    <div>
      {/* Header — Sprint 147 T4: design-tokens.css */}
      <div className="page-header">
        <h1>Dashboard</h1>
        <p className="subtitle">Overview of your EndiorBot activity</p>
      </div>

      {/* Quick Stats — design-aligned stat cards */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value"><span className="accent">{stats.projectCount}</span></div>
          <div className="stat-label">Projects</div>
        </div>
        <div className="stat-card">
          <div className="stat-value"><span className="term">{stats.gatePassCount}</span></div>
          <div className="stat-label">Gates Passed</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.providerCount}</div>
          <div className="stat-label">Providers</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{projectStats.tier}</div>
          <div className="stat-label">Project Tier</div>
        </div>
      </div>

      {/* System Status — design-aligned card */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <span className="card-title">System Status</span>
          <span className={`dot ${isConnected ? "ok" : "warn"}`} />
        </div>
        <div>
          {systemStatus.map((item, index) => (
            <div key={index} className="list-row">
              <span className={`dot ${item.status === "operational" ? "ok" : "warn"}`} />
              <span style={{ flex: 1, fontSize: 14 }}>{item.label}</span>
              <span className="eyebrow">{item.status}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Settings & Gateway Info */}
      <div className="grid grid-cols-2 gap-6">
        {/* Settings */}
        <Card>
          <CardHeader>
            <CardTitle>⚙️ Settings</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-400">Theme</span>
                <span className="text-white font-medium">{theme}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Gateway Port</span>
                <span className="text-white font-medium">{gatewayPort}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Gateway Status */}
        <Card>
          <CardHeader>
            <CardTitle>🌐 Gateway</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-400">Status</span>
                <Badge variant={isConnected ? "success" : "danger"}>
                  {status}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Connected</span>
                <span className="text-white font-medium">{isConnected ? "Yes" : "No"}</span>
              </div>
              {lastChecked && (
                <div className="flex justify-between">
                  <span className="text-gray-400">Last Checked</span>
                  <span className="text-white text-sm">{lastChecked.toLocaleTimeString()}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
