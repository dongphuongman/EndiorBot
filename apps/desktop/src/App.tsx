/**
 * STEP 3: Add Safe Stores (with error handling)
 */

import { useEffect } from "react";
import { Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { useSettingsStore } from "./stores/settings.safe";
import { useGatewayStore } from "./stores/gateway.safe";
import { Dashboard } from "./pages/Dashboard";
import { ChatSimple } from "./pages/ChatSimple";
import { ProjectsPage } from "./pages/Projects";
import { GatesPage } from "./pages/Gates";
import { ExpertsPage } from "./pages/Experts";
import { JuniorHubPage } from "./pages/JuniorHub";

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
    { path: '/projects', icon: '📁', label: 'Projects' },
    { path: '/gates', icon: '🚪', label: 'Gates' },
    { path: '/experts', icon: '🤖', label: 'Experts' },
    { path: '/junior', icon: '👥', label: 'Junior Hub' },
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
  const { checkStatus, connect } = useGatewayStore();

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // Connect to Gateway WebSocket on mount
  useEffect(() => {
    connect();
  }, [connect]);

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
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/chat" element={<ChatSimple />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/gates" element={<GatesPage />} />
        <Route path="/experts" element={<ExpertsPage />} />
        <Route path="/junior" element={<JuniorHubPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </SimpleLayout>
  );
}
