/* ============================================================
   Endiorbot — Desktop App pages (Dashboard, Chat, Projects, Gates, Experts, Junior, Settings)
   ============================================================ */

/* ════════════════ DASHBOARD ════════════════ */
function PageDashboard({ t }) {
  const d = t.dashboard;
  const colorMap = {
    amber:  "var(--accent)",
    term:   "var(--term)",
    rust:   "var(--rust)",
    violet: "var(--violet)",
  };
  return (
    <div style={{padding: 28, maxWidth: 1280}}>
      <SectionHead title={d.title} sub={d.sub}
        right={<div style={{display:"flex", gap: 8}}>
          <button className="btn ghost"><span style={{fontFamily:"var(--font-mono)"}}>⌘K</span> {t.ui.common.search_placeholder.split("…")[0]}…</button>
          <button className="btn primary">+ {t.ui.common.new}</button>
        </div>}/>

      {/* KPI row */}
      <div style={{display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap: 12, marginBottom: 20}}>
        {d.kpi.map((k, i) => (
          <div key={i} className="surface" style={{padding: 16}}>
            <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start"}}>
              <div style={{fontSize: 11.5, color:"var(--ink-3)", textTransform:"uppercase", letterSpacing:".06em"}}>{k.lbl}</div>
              <div style={{fontFamily:"var(--font-mono)", fontSize: 10, color:"var(--term)", padding:"1px 5px", borderRadius: 3, background:"var(--term-soft)"}}>{k.trend}</div>
            </div>
            <div style={{fontFamily:"var(--font-display)", fontSize: 32, fontWeight: 500, marginTop: 6, letterSpacing:"-0.01em"}}>{k.val}</div>
            <div style={{fontSize: 11.5, color:"var(--ink-3)", marginTop: 2}}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Two-col: now playing + activity */}
      <div style={{display:"grid", gridTemplateColumns: "1.1fr 1.4fr", gap: 16, marginBottom: 20}}>
        <Card title={d.now.title} right={<span className="dot live"/>}>
          <div style={{display:"flex", flexDirection:"column", gap: 8}}>
            {d.now.items.map((it, i) => (
              <div key={i} style={{
                display:"grid", gridTemplateColumns:"auto 1fr auto auto", gap: 12, alignItems:"center",
                padding: "10px 12px", border:"1px solid var(--line)", borderRadius: 8, background:"var(--bg-2)"
              }}>
                <AgentAvatar at={it.agent.replace("@","")} size={26}/>
                <div>
                  <div style={{fontSize: 12.5, fontFamily:"var(--font-mono)", color:"var(--accent)"}}>{it.agent}</div>
                  <div style={{fontSize: 12, color:"var(--ink-2)", marginTop: 1}}>{it.act}</div>
                </div>
                <span className="kbd">{it.chan}</span>
                <span style={{fontFamily:"var(--font-mono)", fontSize: 11, color: it.state === "active" ? "var(--term)" : "var(--ink-3)"}}>
                  {it.state === "active" ? "▶" : "⏸"} {it.elapsed}
                </span>
              </div>
            ))}
          </div>
        </Card>

        <Card title={d.activity.title} right={<button className="btn ghost" style={{padding:"4px 8px", fontSize: 11}}>{t.ui.common.view_all} →</button>}>
          <div style={{display:"flex", flexDirection:"column"}}>
            {d.activity.rows.map((r, i) => (
              <div key={i} style={{
                display:"grid", gridTemplateColumns: "44px 18px auto 1fr auto",
                gap: 10, alignItems:"center",
                padding: "8px 0",
                borderBottom: i < d.activity.rows.length - 1 ? "1px solid var(--line)" : "none",
              }}>
                <span style={{fontFamily:"var(--font-mono)", fontSize: 11, color:"var(--ink-3)"}}>{r.time}</span>
                <span style={{fontFamily:"var(--font-mono)", color:"var(--accent)", textAlign:"center"}}>{r.icon}</span>
                <span style={{fontFamily:"var(--font-mono)", fontSize: 11.5, color:"var(--ink-2)"}}>{r.agent}</span>
                <span style={{fontSize: 12.5, color:"var(--ink)"}}>{r.text}</span>
                <span className="kbd">{r.meta}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Gates strip + cost */}
      <div style={{display:"grid", gridTemplateColumns:"1.5fr 1fr", gap: 16}}>
        <Card title={d.gates.title} sub={d.gates.sub}>
          <DashGatesStrip t={t}/>
        </Card>
        <Card title={d.cost.title} sub={d.cost.sub}>
          <div style={{display:"flex", flexDirection:"column", gap: 10, marginTop: 4}}>
            {d.cost.breakdown.map((row, i) => (
              <div key={i}>
                <div style={{display:"flex", justifyContent:"space-between", fontSize: 12, marginBottom: 4}}>
                  <span style={{color:"var(--ink-2)"}}>{row.vendor}</span>
                  <span style={{fontFamily:"var(--font-mono)", color:"var(--ink)"}}>{row.val} <span style={{color:"var(--ink-3)"}}>· {row.pct}%</span></span>
                </div>
                <div style={{height: 4, background:"var(--bg-2)", borderRadius: 2, overflow:"hidden"}}>
                  <div style={{height:"100%", width:`${row.pct}%`, background: colorMap[row.color]}}/>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function DashGatesStrip({ t }) {
  const gates = t.gates.list;
  return (
    <div style={{display:"grid", gridTemplateColumns:"repeat(5, 1fr)", gap: 10, marginTop: 4}}>
      {gates.map((g, i) => {
        const isCurrent = g.status === "pend";
        return (
          <div key={i} style={{
            padding: 12, borderRadius: 8,
            background: isCurrent ? "var(--accent-soft)" : "var(--bg-2)",
            border: `1px solid ${isCurrent ? "var(--accent-line)" : "var(--line)"}`,
            position:"relative", overflow:"hidden",
          }}>
            <div style={{display:"flex", justifyContent:"space-between", alignItems:"center"}}>
              <GateBadge id={g.id} status={g.status}/>
              <span style={{fontSize: 10, fontFamily:"var(--font-mono)", color:"var(--ink-3)", textTransform:"uppercase"}}>
                {g.status === "pass" ? t.gates.legend.pass : g.status === "fail" ? t.gates.legend.fail : g.status === "pend" ? t.gates.legend.pend : t.gates.legend.skip}
              </span>
            </div>
            <div style={{fontSize: 12.5, fontWeight: 600, marginTop: 8}}>{g.name}</div>
            <div style={{fontSize: 11, fontFamily:"var(--font-mono)", color:"var(--ink-3)", marginTop: 4}}>{g.owner}</div>
          </div>
        );
      })}
    </div>
  );
}

/* ════════════════ CHAT ════════════════ */
function PageChat({ t }) {
  const c = t.chat;
  const [activeId, setActiveId] = useState("s1");
  return (
    <div style={{display:"grid", gridTemplateColumns:"260px 1fr", height: "100%"}}>
      {/* sessions list */}
      <div style={{borderRight:"1px solid var(--line)", display:"flex", flexDirection:"column", background:"var(--bg-1)"}}>
        <div style={{padding:"14px 14px 10px", borderBottom:"1px solid var(--line)"}}>
          <div style={{display:"flex", justifyContent:"space-between", alignItems:"center"}}>
            <div style={{fontSize: 11.5, color:"var(--ink-3)", textTransform:"uppercase", letterSpacing:".08em"}}>{c.sidebar_title}</div>
            <button className="btn ghost" style={{padding:"3px 8px", fontSize: 11}}>+ {c.new_chat}</button>
          </div>
        </div>
        <div style={{flex:1, overflow:"auto", padding: 6}}>
          {c.sessions.map((s)=>(
            <div key={s.id} onClick={()=>setActiveId(s.id)}
              style={{
                padding: "10px 10px",
                borderRadius: 6,
                background: s.id === activeId ? "var(--bg-3)" : "transparent",
                cursor:"pointer", marginBottom: 2,
                borderLeft: `2px solid ${s.id === activeId ? "var(--accent)" : "transparent"}`,
              }}>
              <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", gap: 8}}>
                <span style={{fontSize: 12.5, fontWeight: 500, color:"var(--ink)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>{s.title}</span>
                <span style={{fontSize: 10.5, color:"var(--ink-3)", fontFamily:"var(--font-mono)", flexShrink:0}}>{s.time}</span>
              </div>
              <div style={{display:"flex", alignItems:"center", gap: 6, marginTop: 4}}>
                <AgentAvatar at={s.agent.replace("@","")} size={16}/>
                <span style={{fontSize: 11, fontFamily:"var(--font-mono)", color:"var(--ink-3)"}}>{s.agent}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* conversation */}
      <div style={{display:"flex", flexDirection:"column", overflow:"hidden"}}>
        {/* header */}
        <div style={{padding:"14px 22px", borderBottom:"1px solid var(--line)", display:"flex", justifyContent:"space-between", alignItems:"center"}}>
          <div>
            <div style={{fontSize: 14, fontWeight: 600}}>{c.header.title}</div>
            <div style={{fontSize: 11.5, color:"var(--ink-3)", marginTop: 2}}>{c.header.sub}</div>
          </div>
          <div style={{display:"flex", gap: 6}}>
            <span className="kbd">CLI mirror <span className="dot live" style={{display:"inline-block", margin:"0 0 1px 4px"}}/></span>
            <button className="btn ghost" style={{padding:"4px 10px", fontSize: 11}}>{t.ui.common.details}</button>
          </div>
        </div>

        {/* messages */}
        <div style={{flex: 1, overflow:"auto", padding: "20px 22px"}}>
          <div style={{display:"flex", flexDirection:"column", gap: 16, maxWidth: 820}}>
            {c.messages.map((m, i)=>(
              <ChatBubble key={i} m={m} t={t}/>
            ))}
            <ChatTyping/>
          </div>
        </div>

        {/* composer */}
        <div style={{borderTop:"1px solid var(--line)", padding: 16, background:"var(--bg-1)"}}>
          <div style={{
            display:"flex", alignItems:"center", gap: 10,
            border:"1px solid var(--line-2)", borderRadius: 10, background:"var(--bg-2)",
            padding: "10px 14px",
          }}>
            <span style={{fontFamily:"var(--font-mono)", color:"var(--accent)"}}>$</span>
            <input style={{
              flex: 1, background:"transparent", border:"none", outline:"none",
              color:"var(--ink)", fontSize: 13, fontFamily:"inherit",
            }} placeholder={t.ui.common.msg_placeholder} defaultValue=""/>
            <span className="kbd">/</span>
            <span className="kbd">@</span>
            <button className="btn primary" style={{padding:"6px 14px"}}>{t.ui.common.send} ↵</button>
          </div>
          <div style={{display:"flex", gap: 6, marginTop: 8, flexWrap:"wrap"}}>
            {c.slash.slice(0, 4).map((s, i)=>(
              <span key={i} style={{
                fontFamily:"var(--font-mono)", fontSize: 11,
                padding:"3px 8px", borderRadius: 4,
                background:"var(--bg-2)", border:"1px solid var(--line)", color:"var(--ink-2)",
              }}>{s.cmd} <span style={{color:"var(--ink-3)"}}>— {s.desc}</span></span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ChatBubble({ m, t }) {
  if (m.who === "user") {
    return (
      <div style={{display:"flex", justifyContent:"flex-end"}}>
        <div style={{maxWidth: "75%"}}>
          <div style={{
            background:"var(--bg-3)", border:"1px solid var(--line-2)",
            borderRadius: "12px 12px 4px 12px", padding: "10px 14px",
            fontSize: 13.5, lineHeight: 1.5,
          }}>{m.text}</div>
          <div style={{textAlign:"right", fontSize: 10.5, color:"var(--ink-3)", marginTop: 4, fontFamily:"var(--font-mono)"}}>{m.time}</div>
        </div>
      </div>
    );
  }
  return (
    <div style={{display:"flex", gap: 12}}>
      <AgentAvatar at={m.agent} size={32}/>
      <div style={{flex: 1, minWidth: 0}}>
        <div style={{display:"flex", alignItems:"baseline", gap: 8, marginBottom: 4}}>
          <span style={{fontFamily:"var(--font-mono)", fontWeight: 600, color:"var(--accent)", fontSize: 12.5}}>@{m.agent}</span>
          <span style={{fontSize: 10.5, color:"var(--ink-3)", fontFamily:"var(--font-mono)"}}>{m.time}</span>
        </div>
        <div style={{fontSize: 13.5, lineHeight: 1.55, color:"var(--ink)"}}>{m.text}</div>
        {m.tools && (
          <div style={{
            marginTop: 10, padding: 10, borderRadius: 8,
            background:"var(--bg-2)", border:"1px solid var(--line)",
            fontFamily:"var(--font-mono)", fontSize: 11.5,
          }}>
            {m.tools.map((tl, i)=>(
              <div key={i} style={{display:"flex", gap: 8, padding:"3px 0", color:"var(--ink-2)"}}>
                <span style={{color:"var(--term)"}}>✓</span>
                <span style={{color:"var(--accent)"}}>{tl.tool}</span>
                <span style={{color:"var(--ink-3)"}}>({tl.arg})</span>
              </div>
            ))}
          </div>
        )}
        {m.card && m.card.kind === "stories" && <StoryCard items={m.card.items}/>}
        {m.consult && <ConsultCard c={m.consult} t={t}/>}
      </div>
    </div>
  );
}

function StoryCard({ items }) {
  return (
    <div style={{
      marginTop: 10, borderRadius: 8, overflow:"hidden",
      border:"1px solid var(--line)", background:"var(--bg-2)",
    }}>
      <div style={{padding:"8px 12px", background:"var(--bg-3)", fontSize: 11.5, color:"var(--ink-2)", display:"flex", justifyContent:"space-between"}}>
        <span style={{fontFamily:"var(--font-mono)"}}>backlog draft</span>
        <span style={{color:"var(--ink-3)"}}>{items.length} stories · {items.reduce((s,x)=>s+x.points,0)} pts</span>
      </div>
      <div>
        {items.map((it, i)=>(
          <div key={i} style={{
            padding:"10px 12px",
            display:"grid", gridTemplateColumns:"70px 1fr auto auto", gap: 10, alignItems:"center",
            borderTop: i ? "1px solid var(--line)" : "none",
            fontSize: 12.5,
          }}>
            <span style={{fontFamily:"var(--font-mono)", color:"var(--accent)"}}>{it.id}</span>
            <span>{it.title}</span>
            <span style={{display:"inline-flex", alignItems:"center", gap: 4, fontSize: 11, color:"var(--ink-3)"}}>
              <RiskDot level={it.risk}/> {it.risk}
            </span>
            <span style={{fontFamily:"var(--font-mono)", fontSize: 11, padding:"2px 6px", background:"var(--bg-3)", borderRadius: 4, color:"var(--ink-2)"}}>{it.points}p</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ConsultCard({ c, t }) {
  return (
    <div style={{
      marginTop: 10, borderRadius: 10, overflow:"hidden",
      border:"1px solid var(--accent-line)", background:"var(--accent-soft)",
    }}>
      <div style={{padding:"8px 12px", background:"rgba(245,165,36,.06)", borderBottom:"1px solid var(--accent-line)",
        display:"flex", justifyContent:"space-between", alignItems:"center"}}>
        <span style={{fontFamily:"var(--font-mono)", fontSize: 11, color:"var(--accent)"}}>◇ multi-model consult</span>
        <span style={{fontFamily:"var(--font-mono)", fontSize: 11, color:"var(--ink-3)"}}>{(c.ms/1000).toFixed(2)}s</span>
      </div>
      <div style={{padding: 12}}>
        {c.experts.map((e, i)=>(
          <div key={i} style={{display:"grid", gridTemplateColumns:"160px 70px 1fr 50px", gap: 10, padding: "6px 0", fontSize: 12, alignItems:"start", borderTop: i ? "1px solid var(--line)" : "none"}}>
            <span style={{fontFamily:"var(--font-mono)", color:"var(--ink-2)", fontSize: 11.5}}>{e.name}</span>
            <span style={{
              fontFamily:"var(--font-mono)", fontSize: 11, fontWeight: 600,
              color: e.verdict === "Queue" ? "var(--term)" : "var(--warn)",
            }}>{e.verdict}</span>
            <span style={{color:"var(--ink-2)", lineHeight: 1.5}}>{e.reason}</span>
            <span style={{fontFamily:"var(--font-mono)", fontSize: 11, color:"var(--ink-3)", textAlign:"right"}}>{e.weight.toFixed(2)}</span>
          </div>
        ))}
        <div style={{marginTop: 10, padding: "8px 10px", borderRadius: 6, background:"var(--bg-1)", border:"1px solid var(--line)", fontSize: 12.5, display:"flex", justifyContent:"space-between"}}>
          <span><span style={{color:"var(--ink-3)"}}>consensus:</span> <span style={{color:"var(--term)", fontFamily:"var(--font-mono)"}}>{c.consensus}</span></span>
          <span style={{color:"var(--accent)", fontWeight: 600}}>→ {c.recommend}</span>
        </div>
      </div>
    </div>
  );
}

function ChatTyping() {
  return (
    <div style={{display:"flex", gap: 12, opacity: 0.7}}>
      <div style={{width: 32, height: 32}}/>
      <div style={{display:"flex", alignItems:"center", gap: 6, fontSize: 11.5, color:"var(--ink-3)"}}>
        <span className="dot live"/>
        <span style={{fontFamily:"var(--font-mono)"}}>@coder is composing patch…</span>
      </div>
    </div>
  );
}

/* ════════════════ PROJECTS ════════════════ */
function PageProjects({ t }) {
  const p = t.projects;
  return (
    <div style={{padding: 28, maxWidth: 1280}}>
      <SectionHead title={p.title} sub={p.sub}
        right={<button className="btn primary">+ {p.new}</button>}/>
      <div style={{display:"flex", flexDirection:"column", gap: 12}}>
        {p.list.map((proj, i)=>(
          <div key={i} className="surface" style={{
            padding: 18, opacity: proj.active ? 1 : 0.6,
            display:"grid", gridTemplateColumns:"1fr auto", gap: 16, alignItems:"center"
          }}>
            <div style={{display:"flex", flexDirection:"column", gap: 8}}>
              <div style={{display:"flex", alignItems:"center", gap: 10}}>
                <span style={{fontFamily:"var(--font-display)", fontSize: 18, fontWeight: 500}}>{proj.name}</span>
                <TierPill tier={proj.tier === "ENT" ? 1 : proj.tier === "PRO" ? 2 : 3} lite={proj.tier === "LITE"}/>
                {proj.gate && <GateBadge id={proj.gate} status={proj.gate === "G2" ? "pend" : "pass"}/>}
                <span className={`dot ${proj.health}`} style={{marginLeft: 4}}/>
              </div>
              <div style={{fontSize: 12, color:"var(--ink-3)", fontFamily:"var(--font-mono)"}}>{proj.path}</div>
              <div style={{display:"flex", gap: 16, fontSize: 11.5, color:"var(--ink-2)", marginTop: 4, flexWrap:"wrap"}}>
                <span>{proj.stack}</span>
                {proj.sprint && <span><span style={{color:"var(--ink-3)"}}>sprint</span> {proj.sprint}</span>}
                <span><span style={{color:"var(--ink-3)"}}>tests</span> {proj.tests}</span>
                <span><span style={{color:"var(--ink-3)"}}>loc</span> {proj.loc}</span>
                <span><span style={{color:"var(--ink-3)"}}>adrs</span> {proj.adrs}</span>
                <span><span style={{color:"var(--ink-3)"}}>updated</span> {proj.last}</span>
              </div>
            </div>
            <div style={{display:"flex", gap: 6}}>
              <button className="btn ghost">{t.ui.common.details}</button>
              <button className="btn">{t.ui.common.edit}</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ════════════════ GATES ════════════════ */
function PageGates({ t }) {
  const g = t.gates;
  const [openId, setOpenId] = useState("G2");
  return (
    <div style={{padding: 28, maxWidth: 1280}}>
      <SectionHead title={g.title} sub={g.sub}/>
      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap: 12}}>
        {g.list.map((gate, i)=>(
          <div key={i} className="surface" style={{
            padding: 16,
            border: openId === gate.id ? "1px solid var(--accent-line)" : "1px solid var(--line)",
            background: openId === gate.id ? "var(--accent-soft)" : "var(--bg-1)",
            cursor:"pointer",
          }} onClick={()=>setOpenId(gate.id)}>
            <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: 10}}>
              <div style={{display:"flex", alignItems:"center", gap: 10}}>
                <GateBadge id={gate.id} status={gate.status}/>
                <span style={{fontSize: 14, fontWeight: 600}}>{gate.name}</span>
                <span style={{fontFamily:"var(--font-mono)", fontSize: 11, color:"var(--ink-3)"}}>{gate.owner}</span>
              </div>
              <span style={{fontSize: 11, fontFamily:"var(--font-mono)", color:"var(--ink-3)"}}>
                {gate.passed_at ? `✓ ${gate.passed_at}` : "—"}
              </span>
            </div>
            <div style={{display:"flex", flexDirection:"column", gap: 5, fontSize: 12.5}}>
              {gate.checks.map((ch, j)=>(
                <div key={j} style={{display:"flex", gap: 8, alignItems:"flex-start", color: ch.ok ? "var(--ink)" : "var(--ink-3)"}}>
                  <span style={{fontFamily:"var(--font-mono)", color: ch.ok ? "var(--term)" : "var(--ink-3)", flexShrink:0}}>{ch.ok ? "✓" : "○"}</span>
                  <span>{ch.text}</span>
                </div>
              ))}
            </div>
            {gate.evidence.length > 0 && (
              <div style={{marginTop: 10, paddingTop: 10, borderTop:"1px solid var(--line)"}}>
                <div style={{fontSize: 10.5, color:"var(--ink-3)", textTransform:"uppercase", letterSpacing:".06em", marginBottom: 4}}>{t.ui.common.evidence}</div>
                <div style={{display:"flex", flexWrap:"wrap", gap: 4}}>
                  {gate.evidence.map((e, j)=>(<span key={j} className="kbd">{e}</span>))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ════════════════ EXPERTS ════════════════ */
function PageExperts({ t }) {
  const ex = t.experts;
  const experts = window.EB_APP.experts;
  return (
    <div style={{padding: 28, maxWidth: 1280}}>
      <SectionHead title={ex.title} sub={ex.sub}/>
      <Card padding={0}>
        <div style={{
          display:"grid", gridTemplateColumns:"1.6fr 1fr 70px 100px 100px 110px 110px",
          padding:"10px 18px", borderBottom:"1px solid var(--line)",
          fontSize: 10.5, color:"var(--ink-3)", textTransform:"uppercase", letterSpacing:".06em",
        }}>
          {ex.header.map((h,i)=>(<div key={i}>{h}</div>))}
        </div>
        {experts.map((e, i)=>(
          <div key={i} style={{
            display:"grid", gridTemplateColumns:"1.6fr 1fr 70px 100px 100px 110px 110px",
            padding:"12px 18px", alignItems:"center",
            borderBottom: i < experts.length - 1 ? "1px solid var(--line)" : "none",
            fontSize: 12.5,
          }}>
            <div style={{display:"flex", alignItems:"center", gap: 10}}>
              <span style={{fontFamily:"var(--font-mono)", color:"var(--accent)"}}>◇</span>
              <span style={{fontWeight: 500}}>{e.name}</span>
            </div>
            <span style={{color:"var(--ink-2)"}}>{e.vendor}</span>
            <TierPill tier={e.tier}/>
            <span style={{display:"inline-flex", alignItems:"center", gap: 6, fontSize: 11.5, color: e.status === "live" ? "var(--term)" : "var(--ink-3)"}}>
              <span className={`dot ${e.status === "live" ? "live" : "idle"}`}/>
              {e.status === "live" ? "live" : "idle"}
            </span>
            <span style={{fontFamily:"var(--font-mono)", fontSize: 11.5, color:"var(--ink-2)"}}>{e.latency ? `${e.latency}ms` : "—"}</span>
            <span style={{fontFamily:"var(--font-mono)", fontSize: 11.5, color:"var(--ink-2)"}}>{e.used}</span>
            <span style={{fontFamily:"var(--font-mono)", fontSize: 11.5, color:"var(--ink-2)"}}>{e.cost}</span>
          </div>
        ))}
      </Card>

      <div style={{marginTop: 16}}>
        <Card title={ex.consult_title} sub={ex.consult_sub}>
          <ConsultCard c={t.chat.messages.find(m=>m.consult).consult} t={t}/>
        </Card>
      </div>
    </div>
  );
}

/* ════════════════ JUNIOR HUB ════════════════ */
function PageJunior({ t }) {
  const j = t.junior;
  const agents = window.EB_APP.agents;
  return (
    <div style={{padding: 28, maxWidth: 1280}}>
      <SectionHead title={j.title} sub={j.sub}
        right={<button className="btn primary">+ {j.new}</button>}/>
      <div style={{display:"flex", gap: 8, marginBottom: 16}}>
        {j.filters.map((f, i)=>(
          <button key={i} className={i === 0 ? "btn primary" : "btn ghost"} style={{padding:"5px 12px", fontSize: 11.5}}>{f}</button>
        ))}
      </div>
      <div style={{fontSize: 11, color:"var(--ink-3)", textTransform:"uppercase", letterSpacing:".08em", marginBottom: 10}}>{j.cards_title}</div>
      <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(260px, 1fr))", gap: 12, marginBottom: 28}}>
        {agents.map((a, i)=>(
          <div key={i} className="surface" style={{padding: 14}}>
            <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom: 10}}>
              <div style={{display:"flex", gap: 10, alignItems:"center"}}>
                <AgentAvatar at={a.at} size={32}/>
                <div>
                  <div style={{fontFamily:"var(--font-mono)", fontSize: 13.5, color:"var(--accent)", fontWeight: 600}}>@{a.at}</div>
                  <div style={{fontSize: 10.5, color:"var(--ink-3)", textTransform:"uppercase", letterSpacing:".06em", marginTop: 1}}>{a.cat}</div>
                </div>
              </div>
              <TierPill tier={a.tier}/>
            </div>
            <div style={{fontSize: 12, color:"var(--ink-2)", lineHeight: 1.5, minHeight: 38}}>{a.role}</div>
            <div style={{marginTop: 10, paddingTop: 10, borderTop:"1px solid var(--line)", display:"flex", justifyContent:"space-between", alignItems:"center"}}>
              <span className="kbd">{a.model}</span>
              <button className="btn ghost" style={{padding:"3px 8px", fontSize: 11}}>{t.ui.common.edit}</button>
            </div>
          </div>
        ))}
      </div>

      {/* Drafts */}
      <div style={{fontSize: 11, color:"var(--ink-3)", textTransform:"uppercase", letterSpacing:".08em", marginBottom: 10}}>Drafts</div>
      <div style={{display:"grid", gridTemplateColumns:"repeat(2, 1fr)", gap: 12}}>
        {j.drafts.map((d, i)=>(
          <div key={i} className="surface" style={{padding: 14, borderStyle:"dashed"}}>
            <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: 6}}>
              <span style={{fontFamily:"var(--font-mono)", fontSize: 13, color:"var(--ink-2)"}}>{d.name}</span>
              <TierPill tier={d.tier}/>
            </div>
            <div style={{fontSize: 12, color:"var(--ink-3)"}}>{d.role}</div>
            <div style={{marginTop: 8, fontSize: 11, color:"var(--ink-3)", fontFamily:"var(--font-mono)"}}>draft · {d.since}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ════════════════ SETTINGS ════════════════ */
function PageSettings({ t }) {
  const s = t.settings;
  return (
    <div style={{padding: 28, maxWidth: 920}}>
      <SectionHead title={s.title} sub={s.sub}/>
      <div style={{display:"flex", flexDirection:"column", gap: 16}}>
        {s.groups.map((g, i)=>(
          <Card key={i} title={g.h} padding={0}>
            <div>
              {g.rows.map((row, j)=>(
                <div key={j} style={{
                  display:"grid", gridTemplateColumns:"220px 1fr auto", gap: 16, alignItems:"center",
                  padding:"12px 18px",
                  borderTop: j ? "1px solid var(--line)" : "none",
                  fontSize: 12.5,
                }}>
                  <span style={{color:"var(--ink-2)"}}>{row.lbl}</span>
                  <span style={{
                    fontFamily: row.kind === "code" || row.kind === "secret" ? "var(--font-mono)" : "inherit",
                    color: row.kind === "code" ? "var(--accent)" : "var(--ink)",
                    fontSize: row.kind === "code" || row.kind === "secret" ? 12 : 12.5,
                  }}>
                    {row.kind === "toggle" ? (row.val ? "ON" : "OFF")
                     : row.kind === "toggle-text" ? row.val
                     : row.val}
                    {row.status === "ok" && <span className="dot ok" style={{marginLeft: 8}}/>}
                    {row.status === "idle" && <span className="dot idle" style={{marginLeft: 8}}/>}
                  </span>
                  <span>
                    {(row.kind === "toggle" || row.kind === "toggle-text") ? <Toggle on={row.kind === "toggle" ? row.val : row.on}/>
                     : row.kind === "secret" ? <button className="btn ghost" style={{padding:"3px 8px", fontSize: 10.5}}>rotate</button>
                     : <button className="btn ghost" style={{padding:"3px 8px", fontSize: 10.5}}>{t.ui.common.edit}</button>}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

/* expose */
Object.assign(window, { PageDashboard, PageChat, PageProjects, PageGates, PageExperts, PageJunior, PageSettings });
