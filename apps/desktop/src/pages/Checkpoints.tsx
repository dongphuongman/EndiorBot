/**
 * Checkpoints Page
 *
 * View and restore session checkpoints.
 *
 * @module apps/desktop/src/pages/Checkpoints
 * @version 1.0.0
 * @date 2026-02-23
 */

import { useState, useEffect } from "react";
import { History, RotateCcw, Loader2 } from "lucide-react";
import type { Checkpoint } from "../types/electron";
import { formatTimestamp } from "../lib/utils";

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

export function Checkpoints() {
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  useEffect(() => {
    loadCheckpoints();
  }, []);

  const loadCheckpoints = async () => {
    try {
      const data = (await safeIpcInvoke("checkpoints:list")) as Checkpoint[] | null;
      setCheckpoints(data ?? []);
    } catch (error) {
      console.error("Failed to load checkpoints:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRestore = async (id: string) => {
    setRestoringId(id);
    try {
      const result = (await safeIpcInvoke("checkpoints:restore", id)) as {
        success: boolean;
        checkpointId: string;
      } | null;

      if (result?.success) {
        // Show success notification (will implement toast in Sprint 44)
        console.log(`Restored checkpoint: ${result.checkpointId}`);
      }
    } catch (error) {
      console.error("Failed to restore checkpoint:", error);
    } finally {
      setRestoringId(null);
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
          Checkpoints
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          View and restore session checkpoints
        </p>
      </div>

      {/* Checkpoints List */}
      {checkpoints.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-12">
          <History className="h-12 w-12 text-gray-400 dark:text-gray-600" />
          <p className="mt-4 text-gray-500 dark:text-gray-400">
            No checkpoints yet
          </p>
          <p className="text-sm text-gray-400 dark:text-gray-500">
            Checkpoints will appear here when you save your session state
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {checkpoints.map((checkpoint) => (
            <div
              key={checkpoint.id}
              className="card flex items-center justify-between"
            >
              <div className="flex items-center gap-4">
                <div className="rounded-lg bg-primary-100 p-2 dark:bg-primary-900/20">
                  <History className="h-5 w-5 text-primary-600 dark:text-primary-400" />
                </div>
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {checkpoint.description || `Checkpoint ${checkpoint.id}`}
                  </p>
                  <div className="flex gap-4 text-sm text-gray-500 dark:text-gray-400">
                    <span>{formatTimestamp(checkpoint.createdAt)}</span>
                    <span className="font-mono text-xs">
                      {checkpoint.brainDigest.slice(0, 8)}...
                    </span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => handleRestore(checkpoint.id)}
                disabled={restoringId === checkpoint.id}
                className="btn-secondary flex items-center gap-2"
              >
                {restoringId === checkpoint.id ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Restoring...
                  </>
                ) : (
                  <>
                    <RotateCcw className="h-4 w-4" />
                    Restore
                  </>
                )}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
