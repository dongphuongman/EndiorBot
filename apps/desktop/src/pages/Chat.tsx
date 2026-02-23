/**
 * Chat Page
 *
 * Main chat interface for interacting with EndiorBot.
 *
 * @module apps/desktop/src/pages/Chat
 * @version 1.0.0
 * @date 2026-02-23
 */

import { useState } from "react";
import { Send, Paperclip, Mic } from "lucide-react";
import { cn } from "../lib/utils";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export function Chat() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      role: "assistant",
      content:
        "Hello! I'm EndiorBot, your AI development assistant. How can I help you today?",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    // Simulate response (will be replaced with actual gateway call in Sprint 44)
    setTimeout(() => {
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content:
          "This is a placeholder response. Real chat functionality will be implemented in Sprint 44 with Gateway integration.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
      setIsLoading(false);
    }, 1000);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-gray-200 pb-4 dark:border-gray-800">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Chat</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Interact with EndiorBot AI assistant
        </p>
      </div>

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
                    : "bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100"
                )}
              >
                <p className="whitespace-pre-wrap">{message.content}</p>
                <p
                  className={cn(
                    "mt-1 text-xs",
                    message.role === "user"
                      ? "text-primary-200"
                      : "text-gray-500 dark:text-gray-400"
                  )}
                >
                  {message.timestamp.toLocaleTimeString()}
                </p>
              </div>
            </div>
          ))}

          {isLoading && (
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
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message..."
            className="input flex-1"
            disabled={isLoading}
          />
          <button
            type="submit"
            className="btn-primary rounded-lg p-2"
            disabled={!input.trim() || isLoading}
            aria-label="Send message"
          >
            <Send className="h-5 w-5" />
          </button>
        </div>
      </form>
    </div>
  );
}
