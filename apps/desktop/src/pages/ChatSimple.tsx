/**
 * Simple Chat Page - JSON-RPC 2.0 compliant chat interface
 */

import { useState, useEffect, useRef } from "react";
import { useGatewayStore } from "../stores/gateway.safe";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
  usage?: {
    input: number;
    output: number;
    cost: number;
  };
}

export function ChatSimple() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "👋 Hello! I'm EndiorBot. Send me a message to start chatting!",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [currentStreamId, setCurrentStreamId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const requestIdCounter = useRef(0);
  const { isConnected, status, ws } = useGatewayStore();

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Listen for JSON-RPC messages from Gateway
  useEffect(() => {
    if (!ws) return;

    const handleMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        console.log("📨 Gateway message:", data);

        // Handle JSON-RPC response (for chat.stream request)
        if (data.jsonrpc === "2.0" && data.result && data.id) {
          // Stream started
          if (data.result.streamId) {
            console.log("✅ Stream started:", data.result.streamId);
            setCurrentStreamId(data.result.streamId);
          }
        }

        // Handle JSON-RPC error response
        if (data.jsonrpc === "2.0" && data.error && data.id) {
          console.error("❌ Gateway error:", data.error);
          const errorMsg = data.error.message || data.error.code || JSON.stringify(data.error);
          setMessages((prev) => [
            ...prev.filter(m => !m.isStreaming),
            {
              id: Date.now().toString(),
              role: "assistant",
              content: `❌ Error: ${errorMsg}`,
              timestamp: new Date(),
            },
          ]);
          setIsLoading(false);
          setCurrentStreamId(null);
        }

        // Handle JSON-RPC notifications (streaming events)
        if (data.jsonrpc === "2.0" && data.method) {
          if (data.method === "chat.chunk") {
            // Streaming chunk
            const { streamId, delta } = data.params;
            if (streamId === currentStreamId) {
              setMessages((prev) => {
                const lastMsg = prev[prev.length - 1];
                if (lastMsg && lastMsg.isStreaming) {
                  return [
                    ...prev.slice(0, -1),
                    {
                      ...lastMsg,
                      content: lastMsg.content + delta,
                    },
                  ];
                }
                return prev;
              });
            }
          } else if (data.method === "chat.done") {
            // Streaming complete
            const { streamId, content, usage } = data.params;
            if (streamId === currentStreamId) {
              setMessages((prev) => {
                const lastMsg = prev[prev.length - 1];
                if (lastMsg && lastMsg.isStreaming) {
                  return [
                    ...prev.slice(0, -1),
                    {
                      ...lastMsg,
                      content,
                      isStreaming: false,
                      usage,
                    },
                  ];
                }
                return prev;
              });
              setIsLoading(false);
              setCurrentStreamId(null);
            }
          } else if (data.method === "chat.error") {
            // Error occurred
            const { error } = data.params;
            console.error("❌ Chat error:", error);
            setMessages((prev) => [
              ...prev,
              {
                id: Date.now().toString(),
                role: "assistant",
                content: `❌ Error: ${error}`,
                timestamp: new Date(),
              },
            ]);
            setIsLoading(false);
            setCurrentStreamId(null);
          }
        }
      } catch (error) {
        console.error("Failed to parse Gateway message:", error);
      }
    };

    ws.addEventListener("message", handleMessage);
    return () => ws.removeEventListener("message", handleMessage);
  }, [ws, currentStreamId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading || !isConnected || !ws) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    };

    // Add placeholder for assistant response
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

    // Build conversation history
    const history = messages
      .filter((m) => m.id !== "welcome")
      .map((m) => ({
        role: m.role,
        content: m.content,
      }));

    // Send JSON-RPC 2.0 request
    try {
      const requestId = ++requestIdCounter.current;
      const request = {
        jsonrpc: "2.0",
        method: "chat.stream",
        params: {
          message: userMessage.content,
          history,
        },
        id: requestId,
      };

      ws.send(JSON.stringify(request));
      console.log("📤 Sent JSON-RPC request:", request);
    } catch (error) {
      console.error("Failed to send message:", error);
      setIsLoading(false);

      const errorMessage: Message = {
        id: (Date.now() + 2).toString(),
        role: "assistant",
        content: "❌ Failed to send message. Please check Gateway connection.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev.slice(0, -1), errorMessage]);
    }
  };

  const formatCost = (cost: number) => {
    return `$${cost.toFixed(4)}`;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Sprint 147 T4: design-token aligned chat */}
      <div className="page-header" style={{ flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <h1>Chat</h1>
          <span className={`dot ${isConnected ? "live" : "fail"}`} />
          <span className="dim" style={{ fontSize: 13 }}>
            {status === "connected" ? "Connected" : status === "connecting" ? "Connecting..." : "Offline"}
          </span>
          {currentStreamId && <span className="eyebrow">Streaming...</span>}
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", marginBottom: 16, display: "flex", flexDirection: "column", gap: 10 }}>
        {messages.map((message) => (
          <div key={message.id} style={{ display: "flex", justifyContent: message.role === "user" ? "flex-end" : "flex-start" }}>
            <div style={{
              maxWidth: "70%",
              padding: "12px 16px",
              borderRadius: "var(--radius-lg)",
              background: message.role === "user" ? "var(--accent)" : "var(--bg-2)",
              color: message.role === "user" ? "#1a1306" : "var(--ink)",
              border: message.role === "user" ? "none" : "1px solid var(--line)",
            }}>
              <p style={{ margin: 0, whiteSpace: "pre-wrap", fontSize: 14, lineHeight: 1.6 }}>
                {message.content}
                {message.isStreaming && (
                  <span style={{ display: "inline-block", width: 2, height: 16, marginLeft: 4, background: "currentColor", animation: "blink 1s infinite" }} />
                )}
              </p>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6, gap: 8 }}>
                <span className="dim" style={{ fontSize: 11 }}>{message.timestamp.toLocaleTimeString()}</span>
                {message.usage && (
                  <span className="mono dim" style={{ fontSize: 10 }}>
                    {message.usage.input + message.usage.output} tok · {formatCost(message.usage.cost)}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}

        {isLoading && !currentStreamId && (
          <div style={{ display: "flex", justifyContent: "flex-start" }}>
            <div style={{ padding: "12px 16px", borderRadius: "var(--radius-lg)", background: "var(--bg-2)", display: "flex", gap: 4 }}>
              <span className="dot live" />
              <span className="dot live" style={{ animationDelay: "0.2s" }} />
              <span className="dot live" style={{ animationDelay: "0.4s" }} />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} style={{ display: "flex", gap: 8, flexShrink: 0 }}>
        <input
          className="input"
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={isConnected ? "Type your message or @agent task..." : "Waiting for Gateway..."}
          disabled={isLoading || !isConnected}
          style={{ flex: 1, padding: "12px 16px", fontSize: 14 }}
        />
        <button
          type="submit"
          disabled={!input.trim() || isLoading || !isConnected}
          className={`btn ${!input.trim() || isLoading || !isConnected ? "btn-ghost" : "btn-primary"}`}
          style={{ padding: "12px 24px" }}
        >
          {isLoading ? "..." : "Send"}
        </button>
      </form>

      <style>{`
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}
