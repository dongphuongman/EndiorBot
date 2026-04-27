/* global React, Icon */
/* ============================================================
   Endiorbot — section components
   ============================================================ */

/* ---------- Section header ---------- */
function SectionHead({ eyebrow, title, em, lede, id }) {
  return (
    <header className="section-head" id={id}>
      <div className="eyebrow"><span className="dot" />{eyebrow}</div>
      <h2 className="section-h">
        {title}{" "}
        {em && <em>{em}</em>}
      </h2>
      {lede && <p className="lede">{lede}</p>}
    </header>
  );
}

/* ---------- Channels grid ---------- */
function ChannelsSection({ s, items }) {
  const iconFor = (name) => {
    const k = name.toLowerCase();
    if (k.includes("cli")) return <Icon.CLI />;
    if (k.includes("web")) return <Icon.Web />;
    if (k.includes("tele")) return <Icon.Telegram />;
    if (k.includes("zalo")) return <Icon.Zalo />;
    return <Icon.Desktop />;
  };
  return (
    <section id="channels" className="section-divider">
      <div className="shell">
        <SectionHead eyebrow={s.eyebrow} title={s.title} em={s.title_em} lede={s.lede} />
        <div className="channels-row">
          {items.map((c, i) => (
            <div className="channel-cell" key={i}>
              <div className="ico">{iconFor(c.name)}</div>
              <div>
                <div className="name">{c.name}</div>
                <div className="desc">{c.desc}</div>
              </div>
              <code>{c.code}</code>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- Agents grid ---------- */
function AgentsSection({ s, items, lang }) {
  const labels = lang === "vi"
    ? { l1: "Tier 1 · Opus", l2: "Tier 2 · Sonnet", l3: "Tier 3 · Local LLM" }
    : { l1: "Tier 1 · Opus", l2: "Tier 2 · Sonnet", l3: "Tier 3 · Local LLM" };
  return (
    <section id="agents" className="section-divider">
      <div className="shell">
        <SectionHead eyebrow={s.eyebrow} title={s.title} em={s.title_em} lede={s.lede} />
        <div className="agents-legend">
          <span><i className="l1" />{labels.l1}</span>
          <span><i className="l2" />{labels.l2}</span>
          <span><i className="l3" />{labels.l3}</span>
        </div>
        <div className="agents-grid">
          {items.map((a, i) => (
            <article key={i} className={"agent-card tier-" + a.tier}>
              <div className="tier mono">T{a.tier}</div>
              <div className="at mono">{a.at}</div>
              <div className="role">{a.role}</div>
              <div className="use">{a.use}</div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- Architecture (SVG diagram) ---------- */
function ArchSection({ s }) {
  return (
    <section id="arch" className="section-divider">
      <div className="shell">
        <SectionHead eyebrow={s.eyebrow} title={s.title} em={s.title_em} lede={s.lede} />
        <div className="arch-wrap">
          <div className="arch-svg-wrap">
            <ArchDiagram />
          </div>
          <div className="arch-legend">
            <strong>Guards:</strong> PID lockfile · Provider circuit breaker · OTT 60s timeout · Session lock
          </div>
        </div>
      </div>
    </section>
  );
}

function ArchDiagram() {
  // hand-laid SVG so it scales without dropping detail
  return (
    <svg viewBox="0 0 1080 480" width="100%" style={{ display: "block" }} aria-label="architecture diagram">
      <defs>
        <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0 0 L10 5 L0 10 z" fill="var(--ink-3)" />
        </marker>
        <linearGradient id="busg" x1="0" x2="1">
          <stop offset="0%" stopColor="var(--accent)" />
          <stop offset="100%" stopColor="var(--accent-2)" />
        </linearGradient>
      </defs>

      {/* Channel boxes */}
      {[
        { x: 30,  label: "CLI" },
        { x: 230, label: "Web UI" },
        { x: 430, label: "Telegram" },
        { x: 630, label: "Zalo" },
        { x: 830, label: "Desktop" },
      ].map((c, i) => (
        <g key={i}>
          <rect x={c.x} y={20} width={170} height={56} rx="10"
                fill="var(--bg-2)" stroke="var(--line-2)" />
          <text x={c.x + 85} y={47} fontFamily="var(--font-mono)" fontSize="13"
                fill="var(--ink)" textAnchor="middle">{c.label}</text>
          <text x={c.x + 85} y={64} fontFamily="var(--font-mono)" fontSize="10"
                fill="var(--ink-3)" textAnchor="middle">channel</text>
          {/* down line */}
          <line x1={c.x + 85} y1={76} x2={c.x + 85} y2={120} stroke="var(--line-2)" strokeDasharray="3 3" />
        </g>
      ))}

      {/* Message bus */}
      <rect x={30} y={120} width={970} height={50} rx="10"
            fill="url(#busg)" opacity="0.14" stroke="var(--accent)" strokeOpacity="0.6" />
      <text x={515} y={142} fontFamily="var(--font-display)" fontSize="18"
            fill="var(--ink)" textAnchor="middle">MessageBus</text>
      <text x={515} y={159} fontFamily="var(--font-mono)" fontSize="11"
            fill="var(--ink-2)" textAnchor="middle">debounce · dedup · backpressure</text>

      {/* Bus down */}
      <line x1={515} y1={170} x2={515} y2={210} stroke="var(--accent)" markerEnd="url(#arr)" />

      {/* Gateway */}
      <rect x={355} y={210} width={320} height={56} rx="10"
            fill="var(--bg-2)" stroke="var(--line-2)" />
      <text x={515} y={236} fontFamily="var(--font-display)" fontSize="17" fill="var(--ink)" textAnchor="middle">GatewayIngress</text>
      <text x={515} y={254} fontFamily="var(--font-mono)" fontSize="11" fill="var(--ink-3)" textAnchor="middle">/commands → Dispatcher  ·  @agents → Router</text>

      {/* Branch lines */}
      <line x1={420} y1={266} x2={250} y2={310} stroke="var(--line-2)" markerEnd="url(#arr)" />
      <line x1={610} y1={266} x2={780} y2={310} stroke="var(--line-2)" markerEnd="url(#arr)" />

      {/* Dispatcher */}
      <rect x={120} y={310} width={260} height={50} rx="10" fill="var(--bg-2)" stroke="var(--line-2)" />
      <text x={250} y={335} fontFamily="var(--font-mono)" fontSize="13" fill="var(--ink)" textAnchor="middle">CommandDispatcher</text>
      <text x={250} y={350} fontFamily="var(--font-mono)" fontSize="10" fill="var(--ink-3)" textAnchor="middle">39 unified commands</text>

      {/* Router */}
      <rect x={650} y={310} width={260} height={50} rx="10" fill="var(--bg-2)" stroke="var(--line-2)" />
      <text x={780} y={335} fontFamily="var(--font-mono)" fontSize="13" fill="var(--ink)" textAnchor="middle">ChannelRouter</text>
      <text x={780} y={350} fontFamily="var(--font-mono)" fontSize="10" fill="var(--ink-3)" textAnchor="middle">tier-aware · 14 SOULs</text>

      {/* down to providers */}
      <line x1={780} y1={360} x2={780} y2={395} stroke="var(--line-2)" markerEnd="url(#arr)" />

      {/* Providers row */}
      {[
        { x: 540, label: "Claude Code", sub: "primary", color: "var(--accent)" },
        { x: 690, label: "Kimi", sub: "fallback", color: "var(--violet)" },
        { x: 840, label: "Ollama", sub: "local", color: "var(--term)" },
      ].map((p, i) => (
        <g key={i}>
          <rect x={p.x} y={395} width={130} height={44} rx="8"
                fill="var(--bg-3)" stroke="var(--line-2)" />
          <circle cx={p.x + 14} cy={417} r="4" fill={p.color} />
          <text x={p.x + 26} y={414} fontFamily="var(--font-mono)" fontSize="12" fill="var(--ink)">{p.label}</text>
          <text x={p.x + 26} y={429} fontFamily="var(--font-mono)" fontSize="10" fill="var(--ink-3)">{p.sub}</text>
        </g>
      ))}

      {/* CLI direct on left under dispatcher */}
      <rect x={120} y={395} width={260} height={44} rx="8" fill="var(--bg-3)" stroke="var(--line-2)" />
      <text x={250} y={414} fontFamily="var(--font-mono)" fontSize="12" fill="var(--ink)" textAnchor="middle">resolveWorkspace()</text>
      <text x={250} y={429} fontFamily="var(--font-mono)" fontSize="10" fill="var(--ink-3)" textAnchor="middle">/repos · /focus · per-chat workspace</text>
      <line x1={250} y1={360} x2={250} y2={395} stroke="var(--line-2)" strokeDasharray="3 3" />
    </svg>
  );
}

/* ---------- Multi-model section ---------- */
function MultiModelSection({ s, lang }) {
  const consult = lang === "vi"
    ? [
        { who: "@cto",        what: "Postgres + LISTEN/NOTIFY. Đơn giản hơn, ít moving parts.", ms: "2.1s" },
        { who: "Claude Opus", what: "Đồng ý. Redis chỉ thắng khi >50k req/s — không phải case của bạn.", ms: "3.4s" },
        { who: "Gemini",      what: "Cảnh báo: connection pool size cần tăng ~2×.", ms: "2.8s" },
        { who: "Kimi",        what: "Phương án 3: SQLite + WAL nếu chỉ 1 instance.", ms: "1.9s" },
      ]
    : [
        { who: "@cto",        what: "Postgres + LISTEN/NOTIFY. Simpler, fewer moving parts.", ms: "2.1s" },
        { who: "Claude Opus", what: "Agreed. Redis only wins past 50k req/s — not your case.", ms: "3.4s" },
        { who: "Gemini",      what: "Heads-up: bump connection pool by ~2×.", ms: "2.8s" },
        { who: "Kimi",        what: "Option 3: SQLite + WAL if you stay single-instance.", ms: "1.9s" },
      ];
  const labels = lang === "vi"
    ? { providers: "Providers song song", verdict: "Consensus · 8.4s", flow: "Luồng dispatch" }
    : { providers: "Providers in parallel", verdict: "Consensus · 8.4s", flow: "Dispatch flow" };

  return (
    <section className="section-divider">
      <div className="shell">
        <SectionHead eyebrow={s.eyebrow} title={s.title} em={s.title_em} lede={s.lede} />
        <div className="mm-grid">
          <div className="mm-card">
            <div className="label">{labels.providers}</div>
            <div className="mm-providers">
              <span className="mm-prov"><i />Anthropic · Claude</span>
              <span className="mm-prov alt"><i />OpenAI · GPT-4</span>
              <span className="mm-prov alt"><i />Google · Gemini</span>
              <span className="mm-prov alt2"><i />Moonshot · Kimi</span>
              <span className="mm-prov alt2"><i />Ollama · local</span>
              <span className="mm-prov"><i />Groq · fast</span>
            </div>
            <div className="label" style={{ marginTop: 8 }}>{labels.flow}</div>
            <pre className="mono" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.85, color: "var(--ink-2)" }}>
{`@consult "redis vs postgres?"
   ├─ fan-out → 4 providers
   ├─ aggregate(opinions[])
   ├─ rank by confidence
   └─ @cto consolidates → ADR draft`}
            </pre>
          </div>
          <div className="mm-card">
            <div className="label">{labels.verdict}</div>
            {consult.map((r, i) => (
              <div className="mm-row" key={i}>
                <div className="who">{r.who}</div>
                <div className="what">{r.what}</div>
                <div className="ms">{r.ms}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- Before / After ---------- */
function BeforeAfterSection({ s, lang }) {
  const before = lang === "vi"
    ? { eyebrow: "Trước · Không có Endiorbot", clock: ["32", "phút"], items: [
        "Mở 4 tab: ChatGPT, Claude, Gemini, Kimi",
        "Dán prompt giống nhau vào từng tab",
        "Đọc 4 câu trả lời, mất ngữ cảnh",
        "Tự tổng hợp ý kiến · soạn ADR · paste lại",
      ]}
    : { eyebrow: "Before · without Endiorbot", clock: ["32", "min"], items: [
        "Open 4 tabs: ChatGPT, Claude, Gemini, Kimi",
        "Paste the same prompt into each",
        "Read 4 answers, lose context switching",
        "Reconcile manually · draft ADR · paste back",
      ]};
  const after = lang === "vi"
    ? { eyebrow: "Sau · Với Endiorbot", clock: ["28", "giây"], items: [
        "Một câu lệnh: @consult \"…\"",
        "Fan-out song song · gộp tự động",
        "@cto đề xuất · ADR draft kèm sẵn",
        "Evidence ghi vào artefact SDLC",
      ]}
    : { eyebrow: "After · with Endiorbot", clock: ["28", "sec"], items: [
        "One command: @consult \"…\"",
        "Parallel fan-out, auto-consolidated",
        "@cto recommends · ADR draft attached",
        "Evidence logged into SDLC artefact",
      ]};

  return (
    <section className="section-divider">
      <div className="shell">
        <SectionHead eyebrow={s.eyebrow} title={s.title} em={s.title_em} lede={s.lede} />
        <div className="ba-wrap">
          <div className="ba-side ba-before">
            <div className="eyebrow"><span className="dot" style={{ background: "var(--ink-3)", boxShadow: "none" }} />{before.eyebrow}</div>
            <div className="clock">{before.clock[0]}<span className="unit">{before.clock[1]}</span></div>
            <ul>{before.items.map((it, i) => <li key={i}><span className="mark">{String(i+1).padStart(2,"0")}</span><span>{it}</span></li>)}</ul>
          </div>
          <div className="ba-side ba-after">
            <div className="eyebrow"><span className="dot" />{after.eyebrow}</div>
            <div className="clock">{after.clock[0]}<span className="unit">{after.clock[1]}</span></div>
            <ul>{after.items.map((it, i) => <li key={i}><span className="mark">→</span><span>{it}</span></li>)}</ul>
          </div>
        </div>
      </div>
    </section>
  );
}

Object.assign(window, { SectionHead, ChannelsSection, AgentsSection, ArchSection, MultiModelSection, BeforeAfterSection });
