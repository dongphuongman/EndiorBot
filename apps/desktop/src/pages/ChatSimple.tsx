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
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      padding: '20px',
    }}>
      {/* Header */}
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '32px', marginBottom: '8px' }}>💬 Chat</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: isConnected ? '#10b981' : '#ef4444',
            }} />
            <span style={{ fontSize: '14px', color: '#9ca3af' }}>
              {status === 'connected' ? 'Connected' : status === 'connecting' ? 'Connecting...' : 'Offline'}
            </span>
          </div>
          {currentStreamId && (
            <span style={{ fontSize: '12px', color: '#6b7280' }}>
              Streaming...
            </span>
          )}
        </div>
      </div>

      {/* Messages */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        marginBottom: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}>
        {messages.map((message) => (
          <div
            key={message.id}
            style={{
              display: 'flex',
              justifyContent: message.role === 'user' ? 'flex-end' : 'flex-start',
            }}
          >
            <div style={{
              maxWidth: '70%',
              padding: '12px 16px',
              borderRadius: '12px',
              background: message.role === 'user' ? '#3b82f6' : 'rgba(255,255,255,0.1)',
              color: 'white',
            }}>
              <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                {message.content}
                {message.isStreaming && (
                  <span style={{
                    display: 'inline-block',
                    width: '2px',
                    height: '16px',
                    marginLeft: '4px',
                    background: 'currentColor',
                    animation: 'blink 1s infinite',
                  }} />
                )}
              </p>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: '4px',
                gap: '8px',
              }}>
                <p style={{
                  margin: 0,
                  fontSize: '12px',
                  opacity: 0.7,
                }}>
                  {message.timestamp.toLocaleTimeString()}
                </p>
                {message.usage && (
                  <p style={{
                    margin: 0,
                    fontSize: '11px',
                    opacity: 0.6,
                  }}>
                    {message.usage.input + message.usage.output} tokens • {formatCost(message.usage.cost)}
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}

        {isLoading && !currentStreamId && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{
              padding: '12px 16px',
              borderRadius: '12px',
              background: 'rgba(255,255,255,0.1)',
              display: 'flex',
              gap: '4px',
            }}>
              <div style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: '#9ca3af',
                animation: 'bounce 1s infinite',
              }} />
              <div style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: '#9ca3af',
                animation: 'bounce 1s infinite 0.1s',
              }} />
              <div style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: '#9ca3af',
                animation: 'bounce 1s infinite 0.2s',
              }} />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} style={{
        display: 'flex',
        gap: '8px',
      }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={isConnected ? "Type your message..." : "Waiting for Gateway..."}
          disabled={isLoading || !isConnected}
          style={{
            flex: 1,
            padding: '12px 16px',
            borderRadius: '8px',
            border: 'none',
            background: 'rgba(255,255,255,0.1)',
            color: 'white',
            fontSize: '14px',
            outline: 'none',
          }}
        />
        <button
          type="submit"
          disabled={!input.trim() || isLoading || !isConnected}
          style={{
            padding: '12px 24px',
            borderRadius: '8px',
            border: 'none',
            background: (!input.trim() || isLoading || !isConnected) ? '#6b7280' : '#3b82f6',
            color: 'white',
            fontSize: '14px',
            cursor: (!input.trim() || isLoading || !isConnected) ? 'not-allowed' : 'pointer',
            fontWeight: 'bold',
          }}
        >
          {isLoading ? "Sending..." : "Send"}
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
