/**
 * Settings Page — API key management, appearance, gateway config.
 * Uses inline styles (consistent with other desktop pages).
 */

import { useEffect, useState, useCallback } from "react";
import { useSettingsStore } from "../stores/settings.safe";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _ipc: any = null;
function getIpc() {
  if (_ipc) return _ipc;
  try { _ipc = require("electron").ipcRenderer; } catch { /* not in Electron */ }
  return _ipc;
}
const safeIpcInvoke = async (channel: string, ...args: unknown[]) => {
  const ipc = getIpc();
  return ipc ? ipc.invoke(channel, ...args) : null;
};

interface ApiKeyInfo { id: string; envVar: string; masked: string; isSet: boolean }

const PROVIDERS: Record<string, { name: string; hint: string }> = {
  anthropic: { name: "Anthropic (Claude)", hint: "sk-ant-..." },
  openai: { name: "OpenAI (GPT)", hint: "sk-proj-..." },
  gemini: { name: "Google Gemini", hint: "AIzaSy..." },
  kimi: { name: "Kimi (Moonshot)", hint: "sk-..." },
  ollama: { name: "Ollama Remote", hint: "aip_..." },
  mcp_gateway: { name: "MCP Gateway", hint: "your-api-key" },
  telegram: { name: "Telegram Bot", hint: "123456:ABC-DEF..." },
  github: { name: "GitHub PAT", hint: "github_pat_..." },
};

const card: React.CSSProperties = {
  padding: "20px", background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)", borderRadius: "12px", marginBottom: "16px",
};
const label: React.CSSProperties = { fontSize: "12px", color: "#9ca3af", margin: "4px 0 0 0" };

/** Sprint 144: Editable config value — reusable for port, URL, token */
function ConfigEditor({ id, label: fieldLabel, envVar, type = "text", placeholder }: {
  id: string; label: string; envVar: string; type?: "text" | "number" | "password"; placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [currentValue, setCurrentValue] = useState("");
  const [saveMsg, setSaveMsg] = useState("");

  useEffect(() => {
    // Load current value from IPC
    safeIpcInvoke("settings:getApiKeys").then((r: { keys?: Array<{ id: string; masked: string; isSet: boolean }> } | null) => {
      if (!r?.keys) return;
      const k = r.keys.find((k: { id: string }) => k.id === id);
      if (k?.isSet) setCurrentValue(k.masked);
    });
  }, [id, editing]);

  const save = async () => {
    if (!value.trim()) return;
    if (type === "number") {
      const num = parseInt(value, 10);
      if (isNaN(num) || num < 1 || num > 65535) {
        setSaveMsg("Invalid (1-65535)");
        return;
      }
    }
    const r = await safeIpcInvoke("settings:setApiKey", id, value.trim());
    if (r?.success) {
      setSaveMsg("Saved! Restart to apply.");
      setEditing(false);
      setCurrentValue(value.trim());
    } else {
      setSaveMsg(r?.error ?? "Failed");
    }
    setTimeout(() => setSaveMsg(""), 5000);
  };

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 500, color: "#e5e7eb" }}>{fieldLabel}</div>
        <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
          {currentValue || "Not configured"} <span style={{ color: "#4b5563" }}>({envVar})</span>
        </div>
      </div>
      {editing ? (
        <div style={{ display: "flex", gap: 6 }}>
          <input
            type={type === "password" ? "password" : "text"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
            placeholder={placeholder}
            autoFocus
            style={{
              width: type === "number" ? 80 : 160, padding: "4px 8px", fontSize: 13, fontFamily: "monospace",
              border: "1px solid rgba(99,102,241,0.5)", borderRadius: 4,
              background: "rgba(0,0,0,0.3)", color: "#e5e7eb", outline: "none",
            }}
          />
          <button onClick={save} style={{ padding: "4px 10px", fontSize: 11, fontWeight: 600, background: "#6366f1", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer" }}>Save</button>
          <button onClick={() => setEditing(false)} style={{ padding: "4px 8px", fontSize: 11, border: "1px solid rgba(255,255,255,0.15)", borderRadius: 4, background: "transparent", color: "#9ca3af", cursor: "pointer" }}>✕</button>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {saveMsg && <span style={{ fontSize: 11, color: saveMsg.includes("Saved") ? "#4ade80" : "#f87171" }}>{saveMsg}</span>}
          <button onClick={() => { setValue(""); setEditing(true); }} style={{ padding: "4px 12px", fontSize: 12, fontWeight: 500, cursor: "pointer", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 6, background: "transparent", color: "#a5b4fc" }}>
            {currentValue ? "Update" : "Set"}
          </button>
        </div>
      )}
    </div>
  );
}

export function Settings() {
  const { theme, setTheme, gatewayPort } = useSettingsStore();
  const [apiKeys, setApiKeys] = useState<ApiKeyInfo[]>([]);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ id: string; ok: boolean; text: string } | null>(null);

  const loadKeys = useCallback(async () => {
    const r = await safeIpcInvoke("settings:getApiKeys");
    if (r?.keys) setApiKeys(r.keys);
  }, []);

  useEffect(() => { loadKeys(); }, [loadKeys]);

  const saveKey = async (id: string) => {
    if (!inputValue.trim()) return;
    setSaving(true);
    const r = await safeIpcInvoke("settings:setApiKey", id, inputValue.trim());
    if (r?.success) {
      setMsg({ id, ok: true, text: "Saved!" });
      setEditingKey(null); setInputValue(""); loadKeys();
    } else {
      setMsg({ id, ok: false, text: r?.error ?? "Failed" });
    }
    setSaving(false);
    setTimeout(() => setMsg(null), 3000);
  };

  return (
    <div style={{ padding: "20px" }}>
      <h1 style={{ fontSize: "32px", marginBottom: "4px" }}>Settings</h1>
      <p style={{ color: "#9ca3af", marginBottom: "24px" }}>Manage preferences and API keys</p>

      {/* ── API Keys ── */}
      <div style={card}>
        <h2 style={{ fontSize: "18px", fontWeight: 600, color: "#f3f4f6", marginBottom: "4px" }}>
          🔑 API Keys
        </h2>
        <p style={label}>
          Keys are saved to your local <code style={{ background: "rgba(255,255,255,0.08)", padding: "1px 5px", borderRadius: "4px" }}>.env</code> file.
        </p>

        <div style={{ marginTop: "16px", display: "flex", flexDirection: "column", gap: "10px" }}>
          {apiKeys.filter((k) => PROVIDERS[k.id]).map((k) => {
            const p = PROVIDERS[k.id]!;
            const editing = editingKey === k.id;
            return (
              <div key={k.id} style={{
                padding: "12px 16px", border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "10px", background: "rgba(255,255,255,0.03)",
              }}>
                {/* Row: dot + name + button */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <span style={{
                      width: 10, height: 10, borderRadius: "50%",
                      background: k.isSet ? "#22c55e" : "#6b7280", flexShrink: 0,
                    }} />
                    <div>
                      <div style={{ fontSize: "14px", fontWeight: 600, color: "#e5e7eb" }}>{p.name}</div>
                      <div style={{ fontSize: "12px", color: "#6b7280", marginTop: 2 }}>
                        {k.isSet ? k.masked : "Not configured"}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {msg?.id === k.id && (
                      <span style={{ fontSize: 12, color: msg.ok ? "#4ade80" : "#f87171" }}>{msg.text}</span>
                    )}
                    {!editing && (
                      <button
                        onClick={() => { setEditingKey(k.id); setInputValue(""); }}
                        style={{
                          padding: "4px 12px", fontSize: 12, fontWeight: 500, cursor: "pointer",
                          border: "1px solid rgba(255,255,255,0.2)", borderRadius: 6,
                          background: "transparent", color: "#a5b4fc",
                        }}
                      >
                        {k.isSet ? "Update" : "Set"}
                      </button>
                    )}
                  </div>
                </div>

                {/* Inline edit form */}
                {editing && (
                  <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                    <input
                      type="password"
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      placeholder={p.hint}
                      autoFocus
                      onKeyDown={(e) => { if (e.key === "Enter") saveKey(k.id); if (e.key === "Escape") { setEditingKey(null); setInputValue(""); } }}
                      style={{
                        flex: 1, padding: "6px 12px", fontSize: 13,
                        border: "1px solid rgba(99,102,241,0.5)", borderRadius: 6,
                        background: "rgba(0,0,0,0.3)", color: "#e5e7eb", outline: "none",
                      }}
                    />
                    <button
                      onClick={() => saveKey(k.id)}
                      disabled={saving || !inputValue.trim()}
                      style={{
                        padding: "6px 14px", fontSize: 12, fontWeight: 600,
                        background: "#6366f1", color: "#fff", border: "none", borderRadius: 6,
                        cursor: "pointer", opacity: saving || !inputValue.trim() ? 0.5 : 1,
                      }}
                    >
                      {saving ? "..." : "Save"}
                    </button>
                    <button
                      onClick={() => { setEditingKey(null); setInputValue(""); }}
                      style={{
                        padding: "6px 12px", fontSize: 12,
                        border: "1px solid rgba(255,255,255,0.15)", borderRadius: 6,
                        background: "transparent", color: "#9ca3af", cursor: "pointer",
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          {apiKeys.length === 0 && (
            <p style={{ fontSize: 13, color: "#6b7280" }}>Loading API keys...</p>
          )}
        </div>
      </div>

      {/* ── Appearance ── */}
      <div style={card}>
        <h2 style={{ fontSize: "18px", fontWeight: 600, color: "#f3f4f6", marginBottom: "12px" }}>
          Appearance
        </h2>
        <div style={{ display: "flex", gap: 8 }}>
          {(["light", "dark", "system"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTheme(t)}
              style={{
                padding: "8px 16px", fontSize: 13, fontWeight: 500, borderRadius: 8, cursor: "pointer",
                border: theme === t ? "1px solid #6366f1" : "1px solid rgba(255,255,255,0.1)",
                background: theme === t ? "rgba(99,102,241,0.15)" : "transparent",
                color: theme === t ? "#a5b4fc" : "#9ca3af",
              }}
            >
              {t === "light" ? "☀️" : t === "dark" ? "🌙" : "💻"} {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* ── Gateway & Services ── */}
      <div style={card}>
        <h2 style={{ fontSize: "18px", fontWeight: 600, color: "#f3f4f6", marginBottom: "4px" }}>
          ⚙️ Gateway & Services
        </h2>
        <p style={label}>Configuration persisted to .env — restart serve to apply changes</p>
        <div style={{ marginTop: 12 }}>
          <ConfigEditor id="gateway_port" label="Gateway Port" envVar="ENDIORBOT_GATEWAY_PORT" type="number" placeholder="18791" />
          <ConfigEditor id="kimi_proxy_url" label="Kimi Proxy URL" envVar="ENDIORBOT_KIMI_PROXY_URL" placeholder="http://127.0.0.1:18765" />
        </div>
      </div>

      {/* ── About ── */}
      <div style={card}>
        <h2 style={{ fontSize: "18px", fontWeight: 600, color: "#f3f4f6", marginBottom: "8px" }}>About</h2>
        <div style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.8 }}>
          <div><strong style={{ color: "#d1d5db" }}>Version:</strong> 1.0.0</div>
          <div><strong style={{ color: "#d1d5db" }}>Framework:</strong> SDLC 6.3.1</div>
          <div><strong style={{ color: "#d1d5db" }}>Platform:</strong> {typeof process !== "undefined" ? process.platform : "unknown"}</div>
        </div>
      </div>
    </div>
  );
}
