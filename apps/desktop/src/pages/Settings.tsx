/**
 * Settings Page
 *
 * Application settings and preferences.
 *
 * @module apps/desktop/src/pages/Settings
 * @version 1.0.0
 * @date 2026-02-23
 */

import { Settings as SettingsIcon, Moon, Sun, Monitor } from "lucide-react";
import { useSettingsStore } from "../stores/settings";
import { cn } from "../lib/utils";

type Theme = "light" | "dark" | "system";

const themeOptions: { value: Theme; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

export function Settings() {
  const { theme, setTheme, language, gatewayPort } = useSettingsStore();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Settings</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Manage your application preferences
        </p>
      </div>

      {/* Theme */}
      <div className="card">
        <div className="flex items-center gap-3">
          <SettingsIcon className="h-5 w-5 text-gray-500 dark:text-gray-400" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Appearance
          </h2>
        </div>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Customize how EndiorBot looks on your device
        </p>

        <div className="mt-4">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Theme
          </label>
          <div className="mt-2 flex gap-2">
            {themeOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => setTheme(option.value)}
                className={cn(
                  "flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors",
                  theme === option.value
                    ? "border-primary-500 bg-primary-50 text-primary-700 dark:border-primary-400 dark:bg-primary-900/20 dark:text-primary-400"
                    : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                )}
              >
                <option.icon className="h-4 w-4" />
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Language */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          Language
        </h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Select your preferred language
        </p>

        <div className="mt-4">
          <select
            value={language}
            className="input max-w-xs"
            disabled
          >
            <option value="en">English</option>
            <option value="vi">Tiếng Việt</option>
          </select>
          <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
            More languages coming in future updates
          </p>
        </div>
      </div>

      {/* Gateway */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          Gateway
        </h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Gateway connection settings
        </p>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Port
            </label>
            <input
              type="number"
              value={gatewayPort}
              className="input mt-1"
              disabled
            />
          </div>
        </div>
      </div>

      {/* About */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">About</h2>
        <div className="mt-4 space-y-2 text-sm text-gray-600 dark:text-gray-400">
          <p>
            <span className="font-medium text-gray-700 dark:text-gray-300">
              Version:
            </span>{" "}
            1.0.0 (Sprint 43)
          </p>
          <p>
            <span className="font-medium text-gray-700 dark:text-gray-300">
              Framework:
            </span>{" "}
            MTS SDLC Framework 6.1.1
          </p>
          <p>
            <span className="font-medium text-gray-700 dark:text-gray-300">
              Platform:
            </span>{" "}
            {window.electron.platform}
          </p>
        </div>
      </div>

      {/* Keyboard Shortcuts */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          Keyboard Shortcuts
        </h2>
        <div className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600 dark:text-gray-400">New Chat</span>
            <kbd className="rounded bg-gray-100 px-2 py-1 font-mono text-xs dark:bg-gray-800">
              {window.electron.platform === "darwin" ? "⌘ N" : "Ctrl+N"}
            </kbd>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600 dark:text-gray-400">Settings</span>
            <kbd className="rounded bg-gray-100 px-2 py-1 font-mono text-xs dark:bg-gray-800">
              {window.electron.platform === "darwin" ? "⌘ ," : "Ctrl+,"}
            </kbd>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600 dark:text-gray-400">Toggle Theme</span>
            <kbd className="rounded bg-gray-100 px-2 py-1 font-mono text-xs dark:bg-gray-800">
              {window.electron.platform === "darwin" ? "⌘ D" : "Ctrl+D"}
            </kbd>
          </div>
        </div>
      </div>
    </div>
  );
}
