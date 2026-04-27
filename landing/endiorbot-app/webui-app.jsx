/* ============================================================
   Endiorbot — Web UI (browser-based chat at localhost:18790)
   Lighter-weight than desktop, optimized for one job: chat with agents
   ============================================================ */

function WebUIApp({ lang = "en" }) {
  const t = window.EB_APP[lang];
  const w = t.webui;
  const c = t.chat;
  const meta = window.EB_APP.meta;
  const [activeId, setActiveId] = useState("s1");

  return (
    <div style={{
      display: "grid",
      gridTemplateRows: "44px 1fr",
      height: "100%", overflow:"hidden",
      background: "var(--bg)", color: "var(--ink)",
    }}>
      {/* Top bar */}
      <header style={{
        display:"flex", alignItems:"center", gap: 14, padding: "0 16px",
        borderBottom: "1px solid var(--line)", background: "var(--bg-1)",
      }}>
        <div style={{display:"flex", alignItems:"center", gap: 10}}>
          <EBMark size={18}/>
          <span style={{fontFamily:"var(--font-display)", fontSize: 15, fontWeight: 500}}>{w.header_left}</span>
          <span style={{fontFamily:"var(--font-mono)", fontSize: 10.5, color:"var(--ink-3)"}}>{meta.version}</span>
        </div>
        <div style={{flex: 1}}/>
        <div style={{display:"flex", alignItems:"center", gap: 14, fontSize: 11.5, color:"var(--ink-3)", fontFamily:"var(--font-mono)"}}>
          <span style={{display:"inline-flex", alignItems:"center", gap: 6}}>
            <span className="dot live"/>
            <span style={{color:"var(--term)"}}>{w.header_right}</span>
          </span>
          <span style={{color:"var(--ink-4)"}}>│</span>
          <span>{meta.protocol}</span>
        </div>
        <div style={{display:"flex", gap: 6}}>
          <button className="btn ghost" style={{padding:"4px 10px", fontSize: 11}}>↗ open desktop</button>
          <button className="btn ghost" style={{padding:"4px 10px", fontSize: 11}}>⚙</button>
        </div>
      </header>

      {/* Main: sessions + chat */}
      <div style={{display:"grid", gridTemplateColumns:"240px 1fr", overflow:"hidden"}}>
        {/* Sessions */}
        <aside style={{
          borderRight:"1px solid var(--line)", background:"var(--bg-1)",
          display:"flex", flexDirection:"column",
        }}>
          <div style={{padding:"12px 14px", borderBottom:"1px solid var(--line)", display:"flex", alignItems:"center", justifyContent:"space-between"}}>
            <span style={{fontSize: 10.5, color:"var(--ink-3)", textTransform:"uppercase", letterSpacing:".1em"}}>{w.sidebar_title}</span>
            <button className="btn primary" style={{padding:"3px 8px", fontSize: 10.5}}>+ {c.new_chat}</button>
          </div>
          <div style={{flex:1, overflow:"auto", padding: 6}}>
            {c.sessions.map((s)=>(
              <div key={s.id} onClick={()=>setActiveId(s.id)}
                style={{
                  padding: "8px 10px", borderRadius: 6, marginBottom: 1, cursor:"pointer",
                  background: s.id === activeId ? "var(--bg-3)" : "transparent",
                  borderLeft: `2px solid ${s.id === activeId ? "var(--accent)" : "transparent"}`,
                }}>
                <div style={{display:"flex", justifyContent:"space-between", gap: 8, alignItems:"center"}}>
                  <span style={{fontSize: 12, fontWeight: 500, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>{s.title}</span>
                  <span style={{fontSize: 10, color:"var(--ink-3)", fontFamily:"var(--font-mono)", flexShrink:0}}>{s.time}</span>
                </div>
                <div style={{display:"flex", alignItems:"center", gap: 6, marginTop: 3}}>
                  <AgentAvatar at={s.agent.replace("@","")} size={14}/>
                  <span style={{fontSize: 10.5, fontFamily:"var(--font-mono)", color:"var(--ink-3)"}}>{s.agent}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Channel switcher in footer */}
          <div style={{padding:"10px 14px", borderTop:"1px solid var(--line)", fontSize: 10.5, color:"var(--ink-3)"}}>
            <div style={{textTransform:"uppercase", letterSpacing:".08em", marginBottom: 6}}>channels</div>
            <div style={{display:"flex", gap: 6, flexWrap:"wrap"}}>
              {window.EB_APP.channels.map((ch, i)=>(
                <span key={i} className="kbd" style={{
                  display:"inline-flex", alignItems:"center", gap: 4,
                  background: ch.id === "webui" ? "var(--accent-soft)" : "var(--bg-2)",
                  borderColor: ch.id === "webui" ? "var(--accent-line)" : "var(--line)",
                  color: ch.id === "webui" ? "var(--accent)" : "var(--ink-2)",
                }}>
                  <span className="dot live" style={{width: 5, height: 5}}/>
                  {ch.name}
                </span>
              ))}
            </div>
          </div>
        </aside>

        {/* Conversation */}
        <div style={{display:"flex", flexDirection:"column", overflow:"hidden"}}>
          {/* Header */}
          <div style={{padding:"12px 22px", borderBottom:"1px solid var(--line)", display:"flex", justifyContent:"space-between", alignItems:"center"}}>
            <div>
              <div style={{fontSize: 13.5, fontWeight: 600}}>{w.session_active}</div>
              <div style={{fontSize: 11, color:"var(--ink-3)", marginTop: 2}}>{c.header.sub}</div>
            </div>
            <div style={{display:"flex", gap: 6, alignItems:"center"}}>
              <span className="kbd" style={{display:"inline-flex", alignItems:"center", gap: 4}}>
                <span className="dot live" style={{width: 5, height: 5}}/> CLI mirror
              </span>
              <button className="btn ghost" style={{padding:"3px 8px", fontSize: 11}}>⤢</button>
            </div>
          </div>

          {/* Messages */}
          <div style={{flex:1, overflow:"auto", padding: "20px 22px", background:"var(--bg)"}}>
            <div style={{display:"flex", flexDirection:"column", gap: 14, maxWidth: 760}}>
              {c.messages.map((m, i)=>(
                <ChatBubble key={i} m={m} t={t}/>
              ))}
              <ChatTyping/>
            </div>
          </div>

          {/* Composer */}
          <div style={{borderTop:"1px solid var(--line)", padding: 14, background:"var(--bg-1)"}}>
            <div style={{
              display:"flex", alignItems:"center", gap: 10,
              border:"1px solid var(--line-2)", borderRadius: 10, background:"var(--bg-2)",
              padding: "10px 14px",
            }}>
              <span style={{fontFamily:"var(--font-mono)", color:"var(--accent)"}}>›</span>
              <input style={{
                flex: 1, background:"transparent", border:"none", outline:"none",
                color:"var(--ink)", fontSize: 13, fontFamily:"inherit",
              }} placeholder={w.composer_placeholder} defaultValue=""/>
              <span className="kbd">↵</span>
              <button className="btn primary" style={{padding:"5px 12px", fontSize: 11.5}}>{t.ui.common.send}</button>
            </div>
            <div style={{marginTop: 8, fontSize: 10.5, color:"var(--ink-3)", fontFamily:"var(--font-mono)"}}>
              {w.hint}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

window.WebUIApp = WebUIApp;
