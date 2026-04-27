/* global React, SectionHead, Icon */
/* ============================================================
   Endiorbot — remaining sections (SDLC, Quickstart, Sprint, OSS, FAQ, Footer)
   ============================================================ */
const { useState: useState2 } = React;

/* ---------- SDLC ---------- */
function SdlcSection({ s, pillars, gates }) {
  return (
    <section id="sdlc" className="section-divider">
      <div className="shell">
        <SectionHead eyebrow={s.eyebrow} title={s.title} em={s.title_em} lede={s.lede} />
        <div className="sdlc-grid">
          <div>
            <div className="pillars">
              {pillars.map((p, i) => (
                <span className="p" key={i}><strong>{p.k}</strong> · {p.v}</span>
              ))}
            </div>
          </div>
          <div className="gates">
            <h4>Quality Gates</h4>
            {gates.map((g, i) => (
              <div className="gate-row" key={i}>
                <div className="gid">{g.id}</div>
                <div>
                  <div className="gname">{g.name}</div>
                  <div className="gdesc">{g.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- Quickstart ---------- */
function QuickstartSection({ s, lang }) {
  const tabs = lang === "vi"
    ? [["npx", "Chạy không cài"], ["npm", "Cài global"], ["docker", "Docker"]]
    : [["npx", "No install"],     ["npm", "Global install"], ["docker", "Docker"]];
  const [tab, setTab] = useState2("npx");

  const blocks = {
    npx: (
      <pre className="qs-block"><code>
<span className="c"># {lang === "vi" ? "Khởi tạo cấu trúc SDLC" : "Initialize SDLC structure"}</span>{"\n"}
<span className="p">$</span> npx endiorbot init <span className="k">--tier</span> STANDARD{"\n"}
<span className="o">  ✓ created CLAUDE.md, IDENTITY.md, AGENTS.md, docs/</span>{"\n\n"}
<span className="c"># {lang === "vi" ? "Khởi động tất cả kênh" : "Start all channels (Web + Telegram + Zalo)"}</span>{"\n"}
<span className="p">$</span> npx endiorbot serve{"\n"}
<span className="o">  ✓ gateway listening on ws://127.0.0.1:18790</span>{"\n\n"}
<span className="c"># {lang === "vi" ? "Trò chuyện với agent" : "Talk to an agent"}</span>{"\n"}
<span className="p">$</span> npx endiorbot @pm <span className="o">"plan payment gateway"</span>
      </code></pre>
    ),
    npm: (
      <pre className="qs-block"><code>
<span className="p">$</span> corepack enable{"\n"}
<span className="p">$</span> npm install <span className="k">-g</span> endiorbot{"\n\n"}
<span className="p">$</span> endiorbot init <span className="k">--tier</span> PROFESSIONAL{"\n"}
<span className="p">$</span> endiorbot serve{"\n"}
<span className="p">$</span> endiorbot @architect <span className="o">"design auth refresh flow"</span>
      </code></pre>
    ),
    docker: (
      <pre className="qs-block"><code>
<span className="p">$</span> docker run <span className="k">-p</span> 18790:18790 \{"\n"}
{"    "}<span className="k">-e</span> ANTHROPIC_API_KEY=$KEY \{"\n"}
{"    "}endiorbot/endiorbot serve{"\n\n"}
<span className="o">  ✓ gateway listening on ws://0.0.0.0:18790</span>{"\n"}
<span className="o">  ✓ telegram adapter started</span>{"\n"}
<span className="o">  ✓ zalo adapter started</span>
      </code></pre>
    ),
  };

  return (
    <section id="quickstart" className="section-divider">
      <div className="shell">
        <SectionHead eyebrow={s.eyebrow} title={s.title} em={s.title_em} />
        <div className="qs-tabs" role="tablist">
          {tabs.map(([k, label]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{label}</button>
          ))}
        </div>
        {blocks[tab]}
      </div>
    </section>
  );
}

/* ---------- Sprint / Roadmap ---------- */
function SprintSection({ s, sprint, timeline, lang }) {
  return (
    <section id="roadmap" className="section-divider">
      <div className="shell">
        <SectionHead eyebrow={s.eyebrow} title={s.title} em={s.title_em} />
        <div className="sprint-wrap">
          <div className="sprint-card">
            <div className="hd">
              <div>
                <div className="eyebrow">{sprint.title}</div>
                <div className="num"><em>{sprint.num}</em></div>
              </div>
              <div className="mono dim" style={{ fontSize: 11.5, letterSpacing: "0.05em" }}>{sprint.meta}</div>
            </div>
            <ul className="sprint-list">
              {sprint.items.map((it, i) => (
                <li key={i}>
                  <span className="tag">{it.tag}</span>
                  <span><strong>{it.t}</strong> — {it.d}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="eyebrow" style={{ marginBottom: 18 }}>
              <span className="dot" />{lang === "vi" ? "Lộ trình" : "Roadmap"}
            </div>
            <div className="timeline">
              {timeline.map((t, i) => (
                <div className={"timeline-item" + (t.now ? " now" : "")} key={i}>
                  <div className="ver">{t.ver}</div>
                  <div>
                    <h4>{t.title}</h4>
                    <p>{t.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- OSS launch / Contributing ---------- */
function OssSection({ s, contrib, lang }) {
  return (
    <section id="contribute" className="section-divider">
      <div className="shell">
        <div className="oss-wrap">
          <div className="eyebrow"><span className="dot" />{lang === "vi" ? "Ra mắt OSS · 2026-04-27" : "OSS launch · 2026-04-27"}</div>
          <h2 className="section-h" style={{ marginTop: 16 }}>
            {s.title} <em>{s.title_em}</em>
          </h2>
          <p className="lede" style={{ marginTop: 16 }}>{s.lede}</p>
          <div className="oss-meta">
            <span><Icon.Star /><span><strong>1.2k</strong> stars</span></span>
            <span><Icon.Github /><span><strong>endior-net/EndiorBot</strong></span></span>
            <span>· <strong>MIT</strong></span>
            <span>· <strong>49</strong> ADRs published</span>
            <span>· <strong>8,142+</strong> tests</span>
          </div>
          <div className="oss-cta">
            <a href="https://github.com/endior-net/EndiorBot" className="btn btn-primary"><Icon.Star />{s.cta_primary}<Icon.Arrow /></a>
            <a href="https://github.com/endior-net/EndiorBot/issues" className="btn btn-ghost">{s.cta_secondary}</a>
            <a href="https://github.com/endior-net/EndiorBot/blob/main/CONTRIBUTING.md" className="btn btn-link">{s.cta_tertiary} <Icon.Arrow /></a>
          </div>
          <div className="contrib-grid">
            {contrib.map((c, i) => (
              <div className="contrib-card" key={i}>
                <div className="num">/ {c.num}</div>
                <h4>{c.t}</h4>
                <p>{c.d}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- FAQ ---------- */
function FaqSection({ s, items }) {
  const [open, setOpen] = useState2(0);
  return (
    <section id="faq" className="section-divider">
      <div className="shell" style={{ maxWidth: 980 }}>
        <SectionHead eyebrow={s.eyebrow} title={s.title} em={s.title_em} />
        <div className="faq-wrap">
          {items.map((f, i) => (
            <div className="faq-item" key={i} data-open={open === i}>
              <button className="faq-q" onClick={() => setOpen(open === i ? -1 : i)} aria-expanded={open === i}>
                <span>{f.q}</span>
                <span className="marker">+</span>
              </button>
              <div className="faq-a">{f.a}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- Footer ---------- */
function Footer({ foot, lang }) {
  const cols = [foot.product, foot.resources, foot.community];
  return (
    <footer className="foot">
      <div className="shell">
        <div className="foot-grid">
          <div>
            <Brandmark />
            <p className="foot-tag">{foot.tag}</p>
            <p className="foot-tag" style={{ marginTop: 18 }}>endior.net · npm · github.com/endior-net</p>
          </div>
          {cols.map((c, i) => (
            <div className="foot-col" key={i}>
              <h5>{c.h}</h5>
              <ul>
                {c.links.map(([label, href], j) => (
                  <li key={j}><a href={href}>{label}</a></li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="foot-bottom">
          <span>{foot.copy}</span>
          <span>v0.1.0-beta.1 · Sprint 144</span>
        </div>
      </div>
    </footer>
  );
}

Object.assign(window, { SdlcSection, QuickstartSection, SprintSection, OssSection, FaqSection, Footer });
