/* global React, ReactDOM,
   Brandmark, Icon, Terminal, InstallBar,
   ChannelsSection, AgentsSection, ArchSection, MultiModelSection, BeforeAfterSection,
   SdlcSection, QuickstartSection, SprintSection, OssSection, FaqSection, Footer,
   TweaksPanel, useTweaks, TweakSection, TweakRadio, TweakSelect, TweakToggle, TweakColor */

const { useEffect: useEffect3, useState: useState3 } = React;

/* ============================================================
   Tweaks defaults — edited live, persisted to disk
   ============================================================ */
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "amber",
  "headline": "speed",
  "density": "cozy",
  "animatedTerminal": true,
  "showSprint": true,
  "showFaq": true
}/*EDITMODE-END*/;

/* ============================================================
   Hero
   ============================================================ */
function Hero({ t, lang, animatedTerminal, headline }) {
  // headline variants
  const variants = {
    en: {
      speed:    { pre: "From",  em: "30 minutes",  mid: "to",          em2: "30 seconds." },
      org:      { pre: "Your personal", em: "AI engineering org",  mid: "—", em2: "14 agents, 5 channels." },
      orch:     { pre: "The orchestrator", em: "above Claude Code", mid: ".", em2: "" },
      simple:   { pre: "AI agents for", em: "solo developers",      mid: ".", em2: "" },
    },
    vi: {
      speed:    { pre: "Từ",            em: "30 phút",              mid: "xuống",         em2: "30 giây." },
      org:      { pre: "Đội kỹ sư AI",  em: "của riêng bạn",        mid: "—",             em2: "14 agent, 5 kênh." },
      orch:     { pre: "Lớp điều phối", em: "trên Claude Code",     mid: ".",             em2: "" },
      simple:   { pre: "AI agent cho",  em: "lập trình viên solo",  mid: ".",             em2: "" },
    },
  };
  const v = (variants[lang] && variants[lang][headline]) || variants[lang].speed;

  return (
    <section className="hero" id="top">
      <div className="shell">
        <div className="hero-meta">
          <span className="pill"><span className="live" />{t.hero.pill}</span>
          <span className="pill" style={{ background: "transparent" }}>endior.net</span>
        </div>
        <div className="hero-grid">
          <div>
            <h1 className="display">
              {v.pre}{" "}<em>{v.em}</em>{v.mid && <> {v.mid} </>}{v.em2 && <em>{v.em2}</em>}
            </h1>
            <p className="hero-sub">{t.hero.sub}</p>
            <div className="hero-cta">
              <a href="https://github.com/endior-net/EndiorBot" className="btn btn-primary"><Icon.Star />{t.hero.cta_primary}<Icon.Arrow /></a>
              <a href="#quickstart" className="btn btn-ghost">{t.hero.cta_secondary}</a>
            </div>
            <div style={{ marginTop: 28, maxWidth: 420 }}>
              <InstallBar cmd={t.hero.install} />
            </div>
          </div>
          <div>
            {animatedTerminal
              ? <Terminal data={t.terminal} />
              : <StaticTerminal data={t.terminal} />
            }
          </div>
        </div>

        <div className="hero-strip" role="list">
          {t.hero.stats.map((s, i) => (
            <div key={i} role="listitem">
              <div className="num">{i === 0 ? <span className="accent">{s.num}</span> : s.num}</div>
              <div className="lbl">{s.lbl}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function StaticTerminal({ data }) {
  return (
    <div className="terminal">
      <div className="terminal-bar">
        <div className="dots"><span /><span /><span /></div>
        <div className="title">{data.title}</div>
        <div style={{ width: 48 }} />
      </div>
      <div className="terminal-body">
        {data.lines.map((ln, i) => {
          if (ln.t === "spacer") return <div key={i} className="line">&nbsp;</div>;
          if (ln.t === "caret")  return <div key={i} className="line"><span className="prompt">$</span> <span className="caret" /></div>;
          if (ln.t === "comment")return <div key={i} className="line"><span className="comment">{ln.v}</span></div>;
          if (ln.t === "prompt") return <div key={i} className="line"><span className="prompt">{ln.v}</span> <span>{ln.c}</span></div>;
          if (ln.t === "out")    return <div key={i} className="line"><span className="ok">{ln.v}</span></div>;
          return null;
        })}
      </div>
    </div>
  );
}

/* ============================================================
   Top Nav
   ============================================================ */
function Nav({ t, lang, setLang }) {
  return (
    <nav className="nav">
      <div className="shell nav-inner">
        <a href="#top" aria-label="Endiorbot home"><Brandmark /></a>
        <div className="nav-links">
          <a href="#agents">{t.nav.agents}</a>
          <a href="#channels">{t.nav.channels}</a>
          <a href="#arch">Architecture</a>
          <a href="#sdlc">{t.nav.method}</a>
          <a href="#roadmap">Roadmap</a>
        </div>
        <div className="nav-actions">
          <div className="lang" role="group" aria-label="language">
            <button aria-pressed={lang === "en"} onClick={() => setLang("en")}>EN</button>
            <button aria-pressed={lang === "vi"} onClick={() => setLang("vi")}>VI</button>
          </div>
          <a href="https://github.com/endior-net/EndiorBot" className="btn btn-ghost" style={{ padding: "8px 14px" }}>
            <Icon.Github />
            <span style={{ fontSize: 12, fontFamily: "var(--font-mono)" }}>endior-net/EndiorBot</span>
          </a>
        </div>
      </div>
    </nav>
  );
}

/* ============================================================
   App
   ============================================================ */
function App() {
  const [lang, setLang] = useState3(() => localStorage.getItem("eb-lang") || "en");
  useEffect3(() => { localStorage.setItem("eb-lang", lang); document.documentElement.lang = lang; }, [lang]);

  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);

  // apply theme + density
  useEffect3(() => {
    document.documentElement.dataset.theme = tweaks.theme;
    document.documentElement.dataset.density = tweaks.density;
  }, [tweaks.theme, tweaks.density]);

  const t = window.EB_COPY[lang];

  return (
    <>
      <Nav t={t} lang={lang} setLang={setLang} />
      <Hero t={t} lang={lang} animatedTerminal={tweaks.animatedTerminal} headline={tweaks.headline} />
      <ChannelsSection s={t.sections.channels} items={t.channels_data} />
      <AgentsSection s={t.sections.agents} items={t.agents_data} lang={lang} />
      <ArchSection s={t.sections.arch} />
      <MultiModelSection s={t.sections.mm} lang={lang} />
      <BeforeAfterSection s={t.sections.ba} lang={lang} />
      <SdlcSection s={t.sections.sdlc} pillars={t.pillars} gates={t.gates} />
      <QuickstartSection s={t.sections.qs} lang={lang} />
      {tweaks.showSprint && <SprintSection s={t.sections.sprint} sprint={t.sprint} timeline={t.timeline} lang={lang} />}
      <OssSection s={t.sections.oss} contrib={t.contrib} lang={lang} />
      {tweaks.showFaq && <FaqSection s={t.sections.faq} items={t.faq} />}
      <Footer foot={t.foot} lang={lang} />

      <TweaksPanel title="Tweaks">
        <TweakSection title="Theme">
          <TweakRadio
            label="Palette"
            value={tweaks.theme}
            onChange={(v) => setTweak("theme", v)}
            options={[
              { value: "amber",    label: "Amber"  },
              { value: "terminal", label: "Term"   },
              { value: "cobalt",   label: "Cobalt" },
              { value: "paper",    label: "Paper"  },
            ]}
          />
          <TweakRadio
            label="Density"
            value={tweaks.density}
            onChange={(v) => setTweak("density", v)}
            options={[
              { value: "cozy",    label: "Cozy"    },
              { value: "compact", label: "Compact" },
            ]}
          />
        </TweakSection>
        <TweakSection title="Hero">
          <TweakSelect
            label="Headline"
            value={tweaks.headline}
            onChange={(v) => setTweak("headline", v)}
            options={[
              { value: "speed",  label: "30 min → 30 sec" },
              { value: "org",    label: "Personal AI engineering org" },
              { value: "orch",   label: "Orchestrator above Claude Code" },
              { value: "simple", label: "AI agents for solo devs" },
            ]}
          />
          <TweakToggle label="Animated terminal" value={tweaks.animatedTerminal} onChange={(v) => setTweak("animatedTerminal", v)} />
        </TweakSection>
        <TweakSection title="Sections">
          <TweakToggle label="Show Sprint / Roadmap" value={tweaks.showSprint} onChange={(v) => setTweak("showSprint", v)} />
          <TweakToggle label="Show FAQ"             value={tweaks.showFaq}    onChange={(v) => setTweak("showFaq", v)} />
        </TweakSection>
      </TweaksPanel>
    </>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
