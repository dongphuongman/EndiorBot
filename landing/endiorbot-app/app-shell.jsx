/* ============================================================
   Endiorbot — Desktop App shell (sidebar + page router)
   ============================================================ */

function DesktopApp({ lang = "en" }) {
  const [page, setPage] = useState("dashboard");
  const t = window.EB_APP[lang];
  const meta = window.EB_APP.meta;

  const navMain = [
    { id: "dashboard", icon: "▦", label: t.ui.sidebar.dashboard },
    { id: "chat",      icon: "✦", label: t.ui.sidebar.chat, badge: 2 },
    { id: "projects",  icon: "▢", label: t.ui.sidebar.projects },
  ];
  const navGov = [
    { id: "gates",   icon: "G", label: t.ui.sidebar.gates },
    { id: "experts", icon: "◇", label: t.ui.sidebar.experts },
    { id: "junior",  icon: "▲", label: t.ui.sidebar.junior, badge: "14" },
  ];
  const navSys = [
    { id: "settings", icon: "✱", label: t.ui.sidebar.settings },
  ];

  const renderPage = () => {
    switch (page) {
      case "dashboard": return <PageDashboard t={t}/>;
      case "chat":      return <PageChat t={t}/>;
      case "projects":  return <PageProjects t={t}/>;
      case "gates":     return <PageGates t={t}/>;
      case "experts":   return <PageExperts t={t}/>;
      case "junior":    return <PageJunior t={t}/>;
      case "settings":  return <PageSettings t={t}/>;
      default:          return <PageDashboard t={t}/>;
    }
  };

  return (
    <div style={{
      display:"grid", gridTemplateColumns: "232px 1fr", gridTemplateRows: "1fr 28px",
      height: "100%", overflow:"hidden", background:"var(--bg)", color:"var(--ink)",
    }}>
      {/* Sidebar */}
      <aside style={{
        gridRow: "1 / 3",
        background: "linear-gradient(180deg, #0e0e10 0%, #0a0a0b 100%)",
        borderRight: "1px solid var(--line)",
        display:"flex", flexDirection:"column",
        overflow:"hidden",
      }}>
        {/* Brand */}
        <div style={{padding: "18px 18px 14px", borderBottom: "1px solid var(--line)"}}>
          <div style={{display:"flex", alignItems:"center", gap: 10}}>
            <EBMark size={22}/>
            <div>
              <div style={{fontFamily:"var(--font-display)", fontSize: 16, fontWeight: 500, letterSpacing:"-0.01em"}}>{t.ui.app_title}</div>
              <div style={{fontSize: 10, fontFamily:"var(--font-mono)", color:"var(--ink-3)", marginTop: 1}}>{meta.version} · {t.ui.app_tagline}</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{flex: 1, overflow:"auto", padding: "12px 10px"}}>
          <NavSection label={t.ui.sidebar.nav_main} items={navMain} active={page} onSelect={setPage}/>
          <NavSection label={t.ui.sidebar.nav_gov} items={navGov} active={page} onSelect={setPage}/>
          <NavSection label={t.ui.sidebar.nav_sys} items={navSys} active={page} onSelect={setPage}/>
        </nav>

        {/* User pod */}
        <div style={{padding: 12, borderTop: "1px solid var(--line)"}}>
          <div style={{display:"flex", alignItems:"center", gap: 10, padding: "8px 10px", borderRadius: 8, background:"var(--bg-2)"}}>
            <div style={{
              width: 28, height: 28, borderRadius: 6,
              background: "linear-gradient(135deg, var(--rust), var(--accent))",
              display:"flex", alignItems:"center", justifyContent:"center",
              color: "#1a1408", fontWeight: 700, fontSize: 12,
            }}>T</div>
            <div style={{flex: 1, minWidth: 0}}>
              <div style={{fontSize: 12, fontWeight: 500}}>endior</div>
              <div style={{fontSize: 10.5, fontFamily:"var(--font-mono)", color:"var(--ink-3)"}}>{meta.machine}</div>
            </div>
            <span style={{color:"var(--ink-3)"}}>⌄</span>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main style={{
        gridColumn: "2 / 3",
        overflow:"auto", background: page === "chat" ? "var(--bg)" : "var(--bg)",
        position:"relative",
      }}>
        {renderPage()}
      </main>

      {/* Status bar */}
      <footer style={{
        gridColumn: "2 / 3",
        height: 28,
        borderTop: "1px solid var(--line)",
        background: "var(--bg-1)",
        display: "flex", alignItems: "center", padding: "0 14px", gap: 14,
        fontFamily:"var(--font-mono)", fontSize: 11, color:"var(--ink-3)",
      }}>
        <span style={{display:"inline-flex", alignItems:"center", gap: 6}}>
          <span className="dot live"/>
          {t.ui.footer.gateway} <span style={{color:"var(--term)"}}>{meta.gateway}</span> · {t.ui.footer.connected}
        </span>
        <span style={{color:"var(--ink-4)"}}>│</span>
        <span>{meta.protocol}</span>
        <span style={{color:"var(--ink-4)"}}>│</span>
        <span>{t.ui.footer.sprint} {meta.sprint}</span>
        <span style={{color:"var(--ink-4)"}}>│</span>
        <span style={{color:"var(--term)"}}>8,142 {t.ui.footer.tests}</span>
        <span style={{flex: 1}}/>
        <span>5 channels live</span>
        <span style={{color:"var(--ink-4)"}}>│</span>
        <span>4 experts</span>
        <span style={{color:"var(--ink-4)"}}>│</span>
        <span>$3.41 today</span>
      </footer>
    </div>
  );
}

function NavSection({ label, items, active, onSelect }) {
  return (
    <div style={{marginBottom: 16}}>
      <div style={{
        fontSize: 10, color:"var(--ink-4)",
        textTransform:"uppercase", letterSpacing:".1em",
        padding: "4px 10px 6px",
      }}>{label}</div>
      {items.map((it) => {
        const isActive = active === it.id;
        return (
          <button key={it.id} onClick={()=>onSelect(it.id)}
            style={{
              display:"flex", alignItems:"center", gap: 10, width:"100%",
              padding: "8px 10px", marginBottom: 1,
              background: isActive ? "var(--accent-soft)" : "transparent",
              border: "none",
              borderLeft: `2px solid ${isActive ? "var(--accent)" : "transparent"}`,
              borderRadius: "0 6px 6px 0",
              color: isActive ? "var(--ink)" : "var(--ink-2)",
              fontSize: 13, fontWeight: isActive ? 500 : 400,
              cursor:"pointer", textAlign:"left",
              fontFamily: "inherit",
            }}>
            <span style={{
              width: 18, textAlign:"center",
              fontFamily:"var(--font-mono)", fontSize: 12,
              color: isActive ? "var(--accent)" : "var(--ink-3)",
            }}>{it.icon}</span>
            <span style={{flex: 1}}>{it.label}</span>
            {it.badge && (
              <span style={{
                fontSize: 10, fontFamily:"var(--font-mono)",
                padding: "1px 6px", borderRadius: 8,
                background: isActive ? "var(--accent)" : "var(--bg-3)",
                color: isActive ? "#1a1408" : "var(--ink-3)",
              }}>{it.badge}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

window.DesktopApp = DesktopApp;
