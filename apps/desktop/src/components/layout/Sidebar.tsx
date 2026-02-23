/**
 * Sidebar Navigation Component
 *
 * Main navigation sidebar with links to all pages.
 *
 * @module apps/desktop/src/components/layout/Sidebar
 * @version 1.0.0
 * @date 2026-02-23
 */

import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  MessageSquare,
  History,
  BarChart3,
  Settings,
  Zap,
} from "lucide-react";
import { useGatewayStore } from "../../stores/gateway";
import { cn } from "../../lib/utils";

interface NavItem {
  path: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const navItems: NavItem[] = [
  { path: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { path: "/chat", label: "Chat", icon: MessageSquare },
  { path: "/checkpoints", label: "Checkpoints", icon: History },
  { path: "/fix-stats", label: "Fix Stats", icon: BarChart3 },
  { path: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const { status, isConnected } = useGatewayStore();

  return (
    <aside className="flex w-64 flex-col border-r border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
      {/* Logo */}
      <div className="flex h-14 items-center gap-2 border-b border-gray-200 px-4 dark:border-gray-800">
        <Zap className="h-6 w-6 text-primary-500" />
        <span className="text-lg font-semibold text-gray-900 dark:text-white">
          EndiorBot
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-4">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-400"
                  : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
              )
            }
          >
            <item.icon className="h-5 w-5" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* Gateway Status */}
      <div className="border-t border-gray-200 p-4 dark:border-gray-800">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "h-2 w-2 rounded-full",
              status === "running" && "bg-green-500",
              status === "starting" && "animate-pulse bg-yellow-500",
              status === "stopped" && "bg-gray-400",
              status === "error" && "bg-red-500"
            )}
          />
          <span className="text-xs text-gray-500 dark:text-gray-400">
            Gateway: {isConnected ? "Connected" : status}
          </span>
        </div>
      </div>
    </aside>
  );
}
