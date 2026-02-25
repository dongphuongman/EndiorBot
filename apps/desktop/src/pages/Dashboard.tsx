/**
 * Dashboard Page - Project overview and system status
 */

import { useSettingsStore } from "../stores/settings.safe";
import { useGatewayStore } from "../stores/gateway.safe";
import { Card, CardHeader, CardTitle, CardContent, Badge } from "../components/ui";

export function Dashboard() {
  const { theme, gatewayPort } = useSettingsStore();
  const { status, isConnected, lastChecked } = useGatewayStore();

  // Mock project data (will be replaced with real data from stores)
  const projectStats = {
    name: "EndiorBot",
    sprint: "Sprint 44",
    day: "Day 8",
    progress: 75,
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
                <p className="text-sm text-gray-400">{projectStats.sprint} • {projectStats.day}</p>
              </div>
              <Badge variant="info">{projectStats.tier}</Badge>
            </div>

            {/* Progress Bar */}
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-gray-400">Sprint Progress</span>
                <span className="text-white font-medium">{projectStats.progress}%</span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${projectStats.progress}%` }}
                />
              </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-3 gap-4 mt-4">
              <div className="text-center p-3 bg-gray-900 rounded-lg">
                <p className="text-2xl font-bold text-blue-400">12</p>
                <p className="text-xs text-gray-400">Tasks Done</p>
              </div>
              <div className="text-center p-3 bg-gray-900 rounded-lg">
                <p className="text-2xl font-bold text-green-400">8</p>
                <p className="text-xs text-gray-400">Commits</p>
              </div>
              <div className="text-center p-3 bg-gray-900 rounded-lg">
                <p className="text-2xl font-bold text-purple-400">3</p>
                <p className="text-xs text-gray-400">PRs</p>
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
