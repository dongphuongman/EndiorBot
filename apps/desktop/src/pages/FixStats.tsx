/**
 * Fix Stats Page
 *
 * View fix statistics from Sprint 41 FixLogger.
 *
 * @module apps/desktop/src/pages/FixStats
 * @version 1.0.0
 * @date 2026-02-23
 */

import { useState, useEffect } from "react";
import { BarChart3, TrendingUp, CheckCircle, AlertCircle } from "lucide-react";
import type { FixStatsSummary, FixPattern } from "../types/electron";
import { formatPercent, formatDate } from "../lib/utils";
import { cn } from "../lib/utils";

let _ipc: Electron.IpcRenderer | null = null;
function getIpc() {
  if (_ipc) return _ipc;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _ipc = (require("electron") as { ipcRenderer: Electron.IpcRenderer }).ipcRenderer;
  } catch {
    /* not in Electron */
  }
  return _ipc;
}
const safeIpcInvoke = async (channel: string, ...args: unknown[]): Promise<unknown> => {
  const ipc = getIpc();
  return ipc ? ipc.invoke(channel, ...args) : null;
};

export function FixStats() {
  const [summary, setSummary] = useState<FixStatsSummary | null>(null);
  const [patterns, setPatterns] = useState<FixPattern[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const [summaryData, patternsData] = await Promise.all([
        safeIpcInvoke("fixStats:getWeeklySummary") as Promise<FixStatsSummary | null>,
        safeIpcInvoke("fixStats:getPatterns") as Promise<FixPattern[] | null>,
      ]);
      setSummary(summaryData);
      setPatterns(patternsData ?? []);
    } catch (error) {
      console.error("Failed to load fix stats:", error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-gray-500 dark:text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Fix Statistics
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {summary
            ? `${formatDate(summary.period.start)} - ${formatDate(summary.period.end)}`
            : "Weekly fix statistics"}
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="card">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary-100 p-2 dark:bg-primary-900/20">
              <BarChart3 className="h-5 w-5 text-primary-600 dark:text-primary-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Total Fixes</p>
              <p className="text-2xl font-semibold text-gray-900 dark:text-white">
                {summary?.totalFixes ?? 0}
              </p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-green-100 p-2 dark:bg-green-900/20">
              <TrendingUp className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Success Rate</p>
              <p className="text-2xl font-semibold text-gray-900 dark:text-white">
                {formatPercent(summary?.successRate ?? 0)}
              </p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-yellow-100 p-2 dark:bg-yellow-900/20">
              <CheckCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">TYPE Errors</p>
              <p className="text-2xl font-semibold text-gray-900 dark:text-white">
                {summary?.byCategory?.TYPE?.count ?? 0}
              </p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-purple-100 p-2 dark:bg-purple-900/20">
              <AlertCircle className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">LINT Errors</p>
              <p className="text-2xl font-semibold text-gray-900 dark:text-white">
                {summary?.byCategory?.LINT?.count ?? 0}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* By Category */}
      <div className="card">
        <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
          By Category
        </h2>
        <div className="space-y-4">
          {summary?.byCategory &&
            Object.entries(summary.byCategory).map(([category, data]) => (
              <div key={category}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="font-medium text-gray-700 dark:text-gray-300">
                    {category}
                  </span>
                  <span className="text-gray-500 dark:text-gray-400">
                    {data.count} fixes ({formatPercent(data.successRate)} success)
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      data.successRate >= 0.8
                        ? "bg-green-500"
                        : data.successRate >= 0.6
                          ? "bg-yellow-500"
                          : "bg-red-500"
                    )}
                    style={{ width: `${data.successRate * 100}%` }}
                  />
                </div>
              </div>
            ))}
        </div>
      </div>

      {/* Top Patterns */}
      <div className="card">
        <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
          Top Patterns
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="pb-3 font-medium text-gray-500 dark:text-gray-400">
                  Pattern
                </th>
                <th className="pb-3 font-medium text-gray-500 dark:text-gray-400">
                  Category
                </th>
                <th className="pb-3 font-medium text-gray-500 dark:text-gray-400">
                  Count
                </th>
                <th className="pb-3 font-medium text-gray-500 dark:text-gray-400">
                  Success Rate
                </th>
                <th className="pb-3 font-medium text-gray-500 dark:text-gray-400">
                  Avg Duration
                </th>
              </tr>
            </thead>
            <tbody>
              {patterns.map((pattern) => (
                <tr
                  key={pattern.id}
                  className="border-b border-gray-100 dark:border-gray-800"
                >
                  <td className="py-3 font-mono text-gray-900 dark:text-white">
                    {pattern.id}
                  </td>
                  <td className="py-3">
                    <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                      {pattern.category}
                    </span>
                  </td>
                  <td className="py-3 text-gray-700 dark:text-gray-300">
                    {pattern.count}
                  </td>
                  <td className="py-3">
                    <span
                      className={cn(
                        "font-medium",
                        pattern.successRate >= 0.8
                          ? "text-green-600 dark:text-green-400"
                          : pattern.successRate >= 0.6
                            ? "text-yellow-600 dark:text-yellow-400"
                            : "text-red-600 dark:text-red-400"
                      )}
                    >
                      {formatPercent(pattern.successRate)}
                    </span>
                  </td>
                  <td className="py-3 text-gray-500 dark:text-gray-400">
                    {pattern.avgDurationMs}ms
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
