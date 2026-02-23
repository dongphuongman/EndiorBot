/**
 * Root Application Component
 *
 * Handles routing, theme management, and top-level providers.
 *
 * @module apps/desktop/src/App
 * @version 1.0.0
 * @date 2026-02-23
 * @status ACTIVE - Sprint 43 Desktop Foundation
 */

import { useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useSettingsStore } from "./stores/settings";
import { useGatewayStore } from "./stores/gateway";
import { Layout } from "./components/layout/Layout";
import { Dashboard } from "./pages/Dashboard";
import { Chat } from "./pages/Chat";
import { Checkpoints } from "./pages/Checkpoints";
import { FixStats } from "./pages/FixStats";
import { Settings } from "./pages/Settings";

/**
 * Root App Component
 */
export default function App() {
  const { theme, loadSettings } = useSettingsStore();
  const { checkStatus } = useGatewayStore();

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // Check gateway status periodically
  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 5000);
    return () => clearInterval(interval);
  }, [checkStatus]);

  // Apply theme class to document
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else if (theme === "light") {
      root.classList.remove("dark");
    } else {
      // System preference
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      if (prefersDark) {
        root.classList.add("dark");
      } else {
        root.classList.remove("dark");
      }
    }
  }, [theme]);

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/checkpoints" element={<Checkpoints />} />
        <Route path="/fix-stats" element={<FixStats />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </Layout>
  );
}
