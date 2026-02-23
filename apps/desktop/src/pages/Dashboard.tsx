/**
 * Dashboard Page
 *
 * Main overview page showing session status, budget, and approvals.
 *
 * @module apps/desktop/src/pages/Dashboard
 * @version 1.0.0
 * @date 2026-02-23
 */

import { useState, useEffect } from "react";
import { Activity, DollarSign, Clock, CheckCircle2 } from "lucide-react";
import type { Session, Budget } from "../types/electron";
import { formatPercent, formatCurrency } from "../lib/utils";
import { cn } from "../lib/utils";

export function Dashboard() {
  const [session, setSession] = useState<Session | null>(null);
  const [budget, setBudget] = useState<Budget | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [sessionData, budgetData] = await Promise.all([
          window.electron.ipcRenderer.invoke<Session>("session:get"),
          window.electron.ipcRenderer.invoke<Budget>("budget:get"),
        ]);
        setSession(sessionData);
        setBudget(budgetData);
      } catch (error) {
        console.error("Failed to load dashboard data:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
    // Poll every 5 seconds
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, []);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-gray-500 dark:text-gray-400">Loading...</div>
      </div>
    );
  }

  const dailyUsagePercent = budget ? budget.dailyUsed / budget.dailyLimit : 0;
  const monthlyUsagePercent = budget ? budget.monthlyUsed / budget.monthlyLimit : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Overview of your EndiorBot activity
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Session Status */}
        <div className="card">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary-100 p-2 dark:bg-primary-900/20">
              <Activity className="h-5 w-5 text-primary-600 dark:text-primary-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Active Session</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">
                {session?.name ?? "None"}
              </p>
            </div>
          </div>
        </div>

        {/* Token Usage */}
        <div className="card">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-green-100 p-2 dark:bg-green-900/20">
              <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Token Usage</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">
                {session?.tokenCount?.toLocaleString() ?? 0} /{" "}
                {session?.maxTokens?.toLocaleString() ?? 0}
              </p>
            </div>
          </div>
        </div>

        {/* Daily Budget */}
        <div className="card">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-yellow-100 p-2 dark:bg-yellow-900/20">
              <DollarSign className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Daily Budget</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">
                {budget ? formatCurrency(budget.dailyUsed) : "$0.00"} /{" "}
                {budget ? formatCurrency(budget.dailyLimit) : "$0.00"}
              </p>
            </div>
          </div>
        </div>

        {/* Monthly Budget */}
        <div className="card">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-purple-100 p-2 dark:bg-purple-900/20">
              <Clock className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Monthly Budget</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">
                {budget ? formatCurrency(budget.monthlyUsed) : "$0.00"} /{" "}
                {budget ? formatCurrency(budget.monthlyLimit) : "$0.00"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Budget Progress Bars */}
      <div className="card space-y-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          Budget Usage
        </h2>

        {/* Daily Progress */}
        <div>
          <div className="mb-1 flex justify-between text-sm">
            <span className="text-gray-600 dark:text-gray-400">Daily</span>
            <span className="text-gray-900 dark:text-white">
              {formatPercent(dailyUsagePercent)}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                dailyUsagePercent >= 0.9
                  ? "bg-red-500"
                  : dailyUsagePercent >= 0.7
                    ? "bg-yellow-500"
                    : "bg-green-500"
              )}
              style={{ width: `${Math.min(dailyUsagePercent * 100, 100)}%` }}
            />
          </div>
        </div>

        {/* Monthly Progress */}
        <div>
          <div className="mb-1 flex justify-between text-sm">
            <span className="text-gray-600 dark:text-gray-400">Monthly</span>
            <span className="text-gray-900 dark:text-white">
              {formatPercent(monthlyUsagePercent)}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                monthlyUsagePercent >= 0.9
                  ? "bg-red-500"
                  : monthlyUsagePercent >= 0.7
                    ? "bg-yellow-500"
                    : "bg-green-500"
              )}
              style={{ width: `${Math.min(monthlyUsagePercent * 100, 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="card">
        <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
          Quick Actions
        </h2>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary">New Chat</button>
          <button className="btn-secondary">View Checkpoints</button>
          <button className="btn-secondary">View Fix Stats</button>
        </div>
      </div>
    </div>
  );
}
