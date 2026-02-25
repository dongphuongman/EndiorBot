/**
 * STEP 3: Add Safe Stores (with error handling)
 */

import { useEffect } from "react";
import { Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { useSettingsStore } from "./stores/settings.safe";
import { useGatewayStore } from "./stores/gateway.safe";

// Simple placeholder pages
function DashboardPage() {
  const { theme, gatewayPort } = useSettingsStore();
  const { status, isConnected } = useGatewayStore();

  return (
    <div style={{ padding: '20px' }}>
      <h1 style={{ fontSize: '32px', marginBottom: '16px' }}>📊 Dashboard</h1>
      <p>Overview of your EndiorBot activity</p>

      <div style={{ marginTop: '20px', padding: '16px', background: 'rgba(255,255,255,0.1)', borderRadius: '8px' }}>
        <h3>✅ System Status</h3>
        <p>✅ Layout is working!</p>
        <p>✅ Sidebar navigation is working!</p>
        <p>✅ Routing is working!</p>
        <p>✅ Stores are working (safe mode)!</p>
      </div>

      <div style={{ marginTop: '20px', padding: '16px', background: 'rgba(255,255,255,0.1)', borderRadius: '8px' }}>
        <h3>⚙️ Settings</h3>
        <p>Theme: <strong>{theme}</strong></p>
        <p>Gateway Port: <strong>{gatewayPort}</strong></p>
      </div>

      <div style={{ marginTop: '20px', padding: '16px', background: 'rgba(255,255,255,0.1)', borderRadius: '8px' }}>
        <h3>🌐 Gateway Status</h3>
        <p>Status: <strong>{status}</strong></p>
        <p>Connected: <strong>{isConnected ? 'Yes' : 'No'}</strong></p>
      </div>
    </div>
  );
}

function ChatPage() {
  return (
    <div style={{ padding: '20px' }}>
      <h1 style={{ fontSize: '32px', marginBottom: '16px' }}>💬 Chat</h1>
      <p>AI conversation interface</p>
    </div>
  );
}

function SettingsPage() {
  return (
    <div style={{ padding: '20px' }}>
      <h1 style={{ fontSize: '32px', marginBottom: '16px' }}>⚙️ Settings</h1>
      <p>Configure your preferences</p>
    </div>
  );
}

// Simple Layout with Sidebar
function SimpleLayout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = [
    { path: '/dashboard', icon: '📊', label: 'Dashboard' },
    { path: '/chat', icon: '💬', label: 'Chat' },
    { path: '/settings', icon: '⚙️', label: 'Settings' },
  ];

  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      background: '#1a1a2e',
      color: 'white',
    }}>
      {/* Sidebar */}
      <div style={{
        width: '240px',
        background: '#16213e',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      }}>
        <h2 style={{ marginBottom: '20px', fontSize: '20px' }}>EndiorBot</h2>
        {navItems.map((item) => (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            style={{
              padding: '12px 16px',
              background: location.pathname === item.path ? '#0f3460' : 'transparent',
              border: 'none',
              borderRadius: '8px',
              color: 'white',
              cursor: 'pointer',
              textAlign: 'left',
              fontSize: '16px',
              transition: 'background 0.2s',
            }}
          >
            {item.icon} {item.label}
          </button>
        ))}
      </div>

      {/* Main Content */}
      <div style={{
        flex: 1,
        overflow: 'auto',
        background: '#1a1a2e',
      }}>
        {children}
      </div>
    </div>
  );
}

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

  // Apply theme to document root
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [theme]);

  return (
    <SimpleLayout>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </SimpleLayout>
  );
}
