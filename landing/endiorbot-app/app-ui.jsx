/* ============================================================
   Endiorbot — Shared UI primitives (App mocks)
   ============================================================ */

const { useState, useEffect, useRef, useMemo } = React;

/* ─── Endiorbot wordmark ─── */
function EBMark({ size = 16, color }) {
  const c = color || "var(--accent)";
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{flexShrink:0}}>
      <rect x="2.5" y="2.5" width="19" height="19" rx="4" stroke={c} strokeWidth="1.5" />
      <path d="M7 8 L7 16 M7 8 L13 8 M7 12 L11 12 M7 16 L13 16" stroke={c} strokeWidth="1.5" strokeLinecap="square" />
      <circle cx="17" cy="12" r="1.6" fill={c} />
    </svg>
  );
}

/* ─── Agent avatar ─── */
function AgentAvatar({ at, size = 28, ring = false }) {
  const agents = window.EB_APP.agents;
  const a = agents.find(x => x.at === at) || { at, color: "amber", emoji: "●", tier: 3 };
  const colorMap = {
    rust:   "var(--rust)",
    amber:  "var(--accent)",
    violet: "var(--violet)",
  };
  const c = colorMap[a.color] || "var(--accent)";
  return (
    <div style={{
      width: size, height: size, borderRadius: 6,
      background: a.color === "rust" ? "var(--rust-soft)"
                 : a.color === "violet" ? "var(--violet-soft)"
                 : "var(--accent-soft)",
      border: `1px solid ${c}`,
      display:"flex", alignItems:"center", justifyContent:"center",
      color: c, flexShrink: 0,
      fontFamily: "var(--font-mono)",
      fontSize: size * 0.42,
      fontWeight: 600,
      boxShadow: ring ? `0 0 0 3px ${a.color === "rust" ? "var(--rust-soft)" : a.color === "violet" ? "var(--violet-soft)" : "var(--accent-soft)"}` : "none",
    }}>
      {a.emoji}
    </div>
  );
}

/* ─── Tier pill ─── */
function TierPill({ tier, lite }) {
  if (lite) return <span className="tier-pill lite">LITE</span>;
  const cls = tier === 1 ? "t1" : tier === 2 ? "t2" : "t3";
  return <span className={`tier-pill ${cls}`}>T{tier}</span>;
}

/* ─── Gate badge ─── */
function GateBadge({ id, status }) {
  const styles = {
    pass: { bg: "var(--term-soft)", border: "rgba(110,231,135,.4)", color: "var(--term)" },
    fail: { bg: "rgba(255,107,107,.12)", border: "rgba(255,107,107,.4)", color: "var(--danger)" },
    pend: { bg: "var(--accent-soft)", border: "var(--accent-line)", color: "var(--accent)" },
    skip: { bg: "var(--bg-2)", border: "var(--line)", color: "var(--ink-3)" },
  };
  const s = styles[status] || styles.skip;
  return (
    <span style={{
      display:"inline-flex", alignItems:"center", justifyContent:"center",
      minWidth: 32, height: 22,
      padding: "0 8px", borderRadius: 4,
      background: s.bg, border: `1px solid ${s.border}`, color: s.color,
      fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600,
      letterSpacing: ".04em",
    }}>{id}</span>
  );
}

/* ─── Section header ─── */
function SectionHead({ title, sub, right }) {
  return (
    <div style={{display:"flex", alignItems:"flex-end", justifyContent:"space-between", marginBottom: 16, gap: 16}}>
      <div>
        <div style={{fontFamily:"var(--font-display)", fontSize: 26, fontWeight: 500, letterSpacing:"-0.01em", lineHeight: 1.1}}>{title}</div>
        {sub && <div style={{color:"var(--ink-3)", fontSize: 13, marginTop: 4}}>{sub}</div>}
      </div>
      {right}
    </div>
  );
}

/* ─── Card ─── */
function Card({ title, sub, right, children, padding = 18, style }) {
  return (
    <div className="surface" style={{padding, ...style}}>
      {(title || right) && (
        <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom: title ? 14 : 0, gap: 10}}>
          <div>
            {title && <div style={{fontSize: 13, fontWeight: 600, color:"var(--ink)"}}>{title}</div>}
            {sub && <div style={{fontSize: 11.5, color:"var(--ink-3)", marginTop: 2}}>{sub}</div>}
          </div>
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

/* ─── Text input (display only) ─── */
function FakeInput({ value, placeholder, mono, style, onChange, autoFocus }) {
  return (
    <input
      type="text"
      value={value || ""}
      placeholder={placeholder}
      onChange={onChange ? (e)=>onChange(e.target.value) : undefined}
      readOnly={!onChange}
      autoFocus={autoFocus}
      style={{
        background: "var(--bg-2)",
        border: "1px solid var(--line)",
        borderRadius: 6,
        color: "var(--ink)",
        padding: "8px 12px",
        fontSize: 12.5,
        fontFamily: mono ? "var(--font-mono)" : "inherit",
        outline: "none",
        width: "100%",
        ...style,
      }}
      onFocus={(e)=>e.target.style.borderColor = "var(--accent-line)"}
      onBlur={(e)=>e.target.style.borderColor = "var(--line)"}
    />
  );
}

/* ─── Toggle ─── */
function Toggle({ on, onClick }) {
  return (
    <button onClick={onClick} aria-pressed={on}
      style={{
        width: 34, height: 20, borderRadius: 10,
        background: on ? "var(--accent)" : "var(--bg-3)",
        border: `1px solid ${on ? "var(--accent)" : "var(--line-2)"}`,
        position: "relative", cursor: "pointer", padding: 0,
        transition: "all .15s ease",
      }}>
      <span style={{
        position:"absolute", top: 1, left: on ? 15 : 1,
        width: 16, height: 16, borderRadius: "50%",
        background: on ? "#1a1408" : "var(--ink-2)",
        transition: "left .15s ease",
      }}/>
    </button>
  );
}

/* ─── Risk dot ─── */
function RiskDot({ level }) {
  const map = { low: "var(--term)", med: "var(--warn)", high: "var(--danger)" };
  return <span className="dot" style={{background: map[level] || "var(--ink-3)"}}/>;
}

/* expose */
Object.assign(window, { EBMark, AgentAvatar, TierPill, GateBadge, SectionHead, Card, FakeInput, Toggle, RiskDot });
