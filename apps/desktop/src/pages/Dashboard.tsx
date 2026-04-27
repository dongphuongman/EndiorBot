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
      const [repos, gates, providers] = await Promise.all([
        safeIpcInvoke<{ id: string }[]>("repos:list"),
        safeIpcInvoke<{ result: string }[]>("gates:status"),
        safeIpcInvoke<{ name: string }[]>("experts:providers"),
      ]);

      if (cancelled) return;

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
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">📊 Dashboard</h1>
        <p className="text-gray-400">Overview of your EndiorBot activity</p>
      </div>

      {/* Project Overview */}
      <Card>
        <CardHeader>
          <CardTitle>🚀 Current Project</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold text-white">{projectStats.name}</p>
                <p className="text-sm text-gray-400">{projectStats.status} • v{projectStats.version}</p>
              </div>
              <Badge variant="info">{projectStats.tier}</Badge>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-3 gap-4 mt-4">
              <div className="text-center p-3 bg-gray-900 rounded-lg">
                <p className="text-2xl font-bold text-blue-400">{stats.projectCount}</p>
                <p className="text-xs text-gray-400">Projects</p>
              </div>
              <div className="text-center p-3 bg-gray-900 rounded-lg">
                <p className="text-2xl font-bold text-green-400">{stats.gatePassCount}</p>
                <p className="text-xs text-gray-400">Gates Passed</p>
              </div>
              <div className="text-center p-3 bg-gray-900 rounded-lg">
                <p className="text-2xl font-bold text-purple-400">{stats.providerCount}</p>
                <p className="text-xs text-gray-400">Providers</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* System Status */}
      <Card>
        <CardHeader>
          <CardTitle>✅ System Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {systemStatus.map((item, index) => (
              <div key={index} className="flex items-center justify-between py-2 border-b border-gray-700 last:border-0">
                <span className="text-gray-300">{item.label}</span>
                <Badge variant={getStatusBadge(item.status)}>
                  {item.status}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

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
