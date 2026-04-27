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
import { Settings as SettingsPage } from "./pages/Settings";

// Sprint 147 T4: Design-aligned layout using design-tokens.css
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
    <div className="app-shell">
      <div className="sidebar">
        <div className="sidebar-brand">
          Endior<span className="dot-accent">bot</span>
        </div>
        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`nav-item${location.pathname === item.path ? ' active' : ''}`}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
      </div>
      <div className="main-content">
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
