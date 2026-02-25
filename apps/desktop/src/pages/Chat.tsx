/**
 * Chat Page
 *
 * Main chat interface for interacting with EndiorBot via Gateway.
 *
 * @module apps/desktop/src/pages/Chat
 * @version 2.0.0
 * @date 2026-02-25
 * @status ACTIVE - Sprint 47 Chat Integration
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { Send, Paperclip, Mic, AlertCircle, RefreshCw } from "lucide-react";
import { cn } from "../lib/utils";
import {
  useGatewayStore,
  useGatewayStatus,
  useBudget,
  type ChatChunkData,
  type ChatDoneData,
  type ChatErrorData,
} from "../stores/gateway";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
  error?: string;
  usage?: {
    input: number;
    output: number;
    cost: number;
  };
}

export function Chat() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Hello! I'm EndiorBot, your AI development assistant. How can I help you today?",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [currentStreamId, setCurrentStreamId] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { wsStatus, isConnected } = useGatewayStatus();
  const budget = useBudget();
  const gateway = useGatewayStore();

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Connect to gateway on mount if not connected
  useEffect(() => {
    if (wsStatus === "disconnected") {
      gateway.connect();
    }
  }, [wsStatus, gateway]);

  // Subscribe to chat events
  useEffect(() => {
    // Handle streaming chunks
    const unsubChunk = gateway.on<ChatChunkData>("chat.chunk", (data) => {
      if (data.streamId === currentStreamId) {
        setMessages((prev) => {
          const lastMsg = prev[prev.length - 1];
          if (lastMsg && lastMsg.isStreaming) {
            return [
              ...prev.slice(0, -1),
              {
                ...lastMsg,
                content: lastMsg.content + data.delta,
              },
            ];
          }
          return prev;
        });
      }
    });

    // Handle stream completion
    const unsubDone = gateway.on<ChatDoneData>("chat.done", (data) => {
      if (data.streamId === currentStreamId) {
        setMessages((prev) => {
          const lastMsg = prev[prev.length - 1];
          if (lastMsg && lastMsg.isStreaming) {
            return [
              ...prev.slice(0, -1),
              {
                ...lastMsg,
                content: data.content,
                isStreaming: false,
                usage: data.usage,
              },
            ];
          }
          return prev;
        });
        setIsLoading(false);
        setCurrentStreamId(null);
      }
    });

    // Handle stream errors
    const unsubError = gateway.on<ChatErrorData>("chat.error", (data) => {
      if (data.streamId === currentStreamId || !data.streamId) {
        setMessages((prev) => {
          const lastMsg = prev[prev.length - 1];
          if (lastMsg && lastMsg.isStreaming) {
            return [
              ...prev.slice(0, -1),
              {
                ...lastMsg,
                content: lastMsg.content || "Sorry, an error occurred.",
                isStreaming: false,
                error: data.error,
              },
            ];
          }
          return prev;
        });
        setIsLoading(false);
        setCurrentStreamId(null);
      }
    });

    return () => {
      unsubChunk();
      unsubDone();
      unsubError();
    };
  }, [gateway, currentStreamId]);

  // Build conversation history for context
  const buildHistory = useCallback(() => {
    return messages
      .filter((m) => m.id !== "welcome" && !m.error)
      .map((m) => ({
        role: m.role,
        content: m.content,
      }));
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    // Check connection
    if (!isConnected) {
      setConnectionError("Not connected to Gateway. Attempting to reconnect...");
      gateway.connect();
      return;
    }

    setConnectionError(null);

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    };

    // Add user message and placeholder for assistant
    const assistantPlaceholder: Message = {
      id: (Date.now() + 1).toString(),
      role: "assistant",
      content: "",
      timestamp: new Date(),
      isStreaming: true,
    };

    setMessages((prev) => [...prev, userMessage, assistantPlaceholder]);
    setInput("");
    setIsLoading(true);

    try {
      // Use streaming for better UX
      const result = await gateway.send("chat.stream", {
        message: userMessage.content,
        history: buildHistory(),
      }) as { streamId: string; model: string };

      setCurrentStreamId(result.streamId);
    } catch (error) {
      // Handle send error
      setMessages((prev) => {
        const lastMsg = prev[prev.length - 1];
        if (lastMsg && lastMsg.isStreaming) {
          return [
            ...prev.slice(0, -1),
            {
              ...lastMsg,
              content: "Failed to send message. Please try again.",
              isStreaming: false,
              error: error instanceof Error ? error.message : "Unknown error",
            },
          ];
        }
        return prev;
      });
      setIsLoading(false);
      setCurrentStreamId(null);
    }
  };

  const handleRetry = () => {
    gateway.connect();
    setConnectionError(null);
  };

  const formatCost = (cost: number) => {
    return `$${cost.toFixed(4)}`;
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-gray-200 pb-4 dark:border-gray-800">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Chat</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Interact with EndiorBot AI assistant
            </p>
          </div>
          <div className="flex items-center gap-4">
            {/* Connection status */}
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "h-2 w-2 rounded-full",
                  isConnected ? "bg-green-500" : "bg-red-500"
                )}
              />
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {wsStatus === "connected"
                  ? "Connected"
                  : wsStatus === "connecting"
                  ? "Connecting..."
                  : wsStatus === "reconnecting"
                  ? "Reconnecting..."
                  : "Disconnected"}
              </span>
            </div>
            {/* Budget display */}
            <div className="text-xs text-gray-500 dark:text-gray-400">
              Session: {formatCost(budget.sessionTotal)}
            </div>
          </div>
        </div>
      </div>

      {/* Connection error banner */}
      {connectionError && (
        <div className="flex items-center gap-2 bg-red-50 px-4 py-2 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
          <AlertCircle className="h-4 w-4" />
          <span>{connectionError}</span>
          <button
            onClick={handleRetry}
            className="ml-auto flex items-center gap-1 rounded px-2 py-1 hover:bg-red-100 dark:hover:bg-red-900/40"
          >
            <RefreshCw className="h-3 w-3" />
            Retry
          </button>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-4">
        <div className="space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                "flex",
                message.role === "user" ? "justify-end" : "justify-start"
              )}
            >
              <div
                className={cn(
                  "max-w-[80%] rounded-lg px-4 py-2",
                  message.role === "user"
                    ? "bg-primary-600 text-white"
                    : "bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100",
                  message.error && "border border-red-300 dark:border-red-700"
                )}
              >
                <p className="whitespace-pre-wrap">
                  {message.content}
                  {message.isStreaming && (
                    <span className="ml-1 inline-block h-4 w-1 animate-pulse bg-current" />
                  )}
                </p>
                <div className="mt-1 flex items-center justify-between gap-4">
                  <p
                    className={cn(
                      "text-xs",
                      message.role === "user"
                        ? "text-primary-200"
                        : "text-gray-500 dark:text-gray-400"
                    )}
                  >
                    {message.timestamp.toLocaleTimeString()}
                  </p>
                  {message.usage && (
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      {message.usage.input + message.usage.output} tokens • {formatCost(message.usage.cost)}
                    </p>
                  )}
                </div>
                {message.error && (
                  <p className="mt-1 text-xs text-red-500 dark:text-red-400">
                    Error: {message.error}
                  </p>
                )}
              </div>
            </div>
          ))}

          {isLoading && !currentStreamId && (
            <div className="flex justify-start">
              <div className="rounded-lg bg-gray-100 px-4 py-2 dark:bg-gray-800">
                <div className="flex space-x-1">
                  <div className="h-2 w-2 animate-bounce rounded-full bg-gray-400" />
                  <div
                    className="h-2 w-2 animate-bounce rounded-full bg-gray-400"
                    style={{ animationDelay: "0.1s" }}
                  />
                  <div
                    className="h-2 w-2 animate-bounce rounded-full bg-gray-400"
                    style={{ animationDelay: "0.2s" }}
                  />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="border-t border-gray-200 pt-4 dark:border-gray-800"
      >
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn-ghost rounded-lg p-2"
            aria-label="Attach file"
          >
            <Paperclip className="h-5 w-5 text-gray-500 dark:text-gray-400" />
          </button>
          <button
            type="button"
            className="btn-ghost rounded-lg p-2"
            aria-label="Voice input"
          >
            <Mic className="h-5 w-5 text-gray-500 dark:text-gray-400" />
          </button>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isConnected ? "Type your message..." : "Connecting to Gateway..."}
            className="input flex-1"
            disabled={isLoading || !isConnected}
          />
          <button
            type="submit"
            className="btn-primary rounded-lg p-2"
            disabled={!input.trim() || isLoading || !isConnected}
            aria-label="Send message"
          >
            <Send className="h-5 w-5" />
          </button>
        </div>
      </form>
    </div>
  );
}
