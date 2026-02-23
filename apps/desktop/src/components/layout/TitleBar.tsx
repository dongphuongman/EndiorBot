/**
 * Title Bar Component
 *
 * Custom title bar with window controls (for Windows/Linux).
 * On macOS, uses native title bar with traffic lights.
 *
 * @module apps/desktop/src/components/layout/TitleBar
 * @version 1.0.0
 * @date 2026-02-23
 */

import { useState, useEffect } from "react";
import { Minus, Square, X, Maximize2 } from "lucide-react";

export function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);
  const platform = window.electron.platform;

  // Check if maximized on mount and window state changes
  useEffect(() => {
    const checkMaximized = async () => {
      const maximized = await window.electron.ipcRenderer.invoke<boolean>(
        "window:isMaximized"
      );
      setIsMaximized(maximized);
    };

    checkMaximized();

    // Listen for window state changes
    const handleResize = () => checkMaximized();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // On macOS, use native title bar
  if (platform === "darwin") {
    return (
      <div
        className="h-8 shrink-0 bg-white dark:bg-gray-950"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      />
    );
  }

  const handleMinimize = () => {
    window.electron.ipcRenderer.invoke("window:minimize");
  };

  const handleMaximize = () => {
    window.electron.ipcRenderer.invoke("window:maximize");
    setIsMaximized(!isMaximized);
  };

  const handleClose = () => {
    window.electron.ipcRenderer.invoke("window:close");
  };

  return (
    <div
      className="flex h-8 shrink-0 items-center justify-between border-b border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      {/* Title */}
      <div className="px-4 text-sm font-medium text-gray-700 dark:text-gray-300">
        EndiorBot
      </div>

      {/* Window controls */}
      <div
        className="flex"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <button
          onClick={handleMinimize}
          className="flex h-8 w-12 items-center justify-center text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
          aria-label="Minimize"
        >
          <Minus className="h-4 w-4" />
        </button>
        <button
          onClick={handleMaximize}
          className="flex h-8 w-12 items-center justify-center text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
          aria-label={isMaximized ? "Restore" : "Maximize"}
        >
          {isMaximized ? (
            <Maximize2 className="h-3.5 w-3.5" />
          ) : (
            <Square className="h-3.5 w-3.5" />
          )}
        </button>
        <button
          onClick={handleClose}
          className="flex h-8 w-12 items-center justify-center text-gray-500 hover:bg-red-500 hover:text-white dark:text-gray-400"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
