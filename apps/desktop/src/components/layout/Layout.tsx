/**
 * Main Layout Component
 *
 * Application shell with sidebar navigation.
 *
 * @module apps/desktop/src/components/layout/Layout
 * @version 1.0.0
 * @date 2026-02-23
 */

import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { TitleBar } from "./TitleBar";

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="flex h-screen flex-col bg-gray-50 dark:bg-gray-900">
      {/* Title bar (for custom window controls) */}
      <TitleBar />

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar navigation */}
        <Sidebar />

        {/* Main content area */}
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
