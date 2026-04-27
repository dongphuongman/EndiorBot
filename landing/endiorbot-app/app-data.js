/* ============================================================
   Endiorbot — App Mock Data (EN + VI)
   ============================================================ */

window.EB_APP = {
  /* ───────────── shared ───────────── */
  meta: {
    version: "v0.1.0-beta.1",
    framework: "SDLC Framework 6.3.1",
    gateway: "ws://127.0.0.1:18790",
    protocol: "JSON-RPC 2.0",
    user: "endior",
    machine: "endior-mbp.local",
    sprint: 144,
  },

  /* All 14 SOUL agents — exact roster from real codebase */
  agents: [
    { at: "ceo",       cat: "ADVISOR",  tier: 1, role: "Executive strategy & Go/No-Go calls",          model: "claude-sonnet-4.5", color: "rust",   emoji: "◆" },
    { at: "cto",       cat: "ADVISOR",  tier: 2, role: "Architecture review & technical depth",        model: "claude-sonnet-4.5", color: "rust",   emoji: "◆" },
    { at: "cso",       cat: "ADVISOR",  tier: 1, role: "Security review & threat modeling",            model: "claude-sonnet-4.5", color: "rust",   emoji: "◆" },
    { at: "cpo",       cat: "ADVISOR",  tier: 2, role: "Product vision & user research",               model: "gpt-4o",            color: "rust",   emoji: "◆" },
    { at: "architect", cat: "EXECUTOR", tier: 1, role: "ADRs, system design, G2 gate ownership",       model: "claude-sonnet-4.5", color: "amber",  emoji: "▲" },
    { at: "pm",        cat: "EXECUTOR", tier: 2, role: "Sprint planning, backlog, requirements",       model: "claude-sonnet-4.5", color: "amber",  emoji: "▲" },
    { at: "pjm",       cat: "EXECUTOR", tier: 2, role: "Project tracking, velocity, evidence",         model: "gemini-2.5-pro",    color: "amber",  emoji: "▲" },
    { at: "coder",     cat: "EXECUTOR", tier: 2, role: "Code generation, bug fixes, refactors",        model: "claude-sonnet-4.5", color: "amber",  emoji: "▲" },
    { at: "fullstack", cat: "EXECUTOR", tier: 2, role: "End-to-end features (FE + BE)",                model: "claude-sonnet-4.5", color: "amber",  emoji: "▲" },
    { at: "reviewer",  cat: "EXECUTOR", tier: 2, role: "Code review & quality enforcement",            model: "kimi-k2",           color: "amber",  emoji: "▲" },
    { at: "tester",    cat: "EXECUTOR", tier: 2, role: "Test strategy, E2E coverage, fixtures",        model: "gemini-2.5-pro",    color: "amber",  emoji: "▲" },
    { at: "devops",    cat: "EXECUTOR", tier: 2, role: "CI/CD, infra, deployment automation",          model: "gpt-4o",            color: "amber",  emoji: "▲" },
    { at: "researcher",cat: "EXECUTOR", tier: 2, role: "Technology research & ADR drafts",             model: "gemini-2.5-pro",    color: "amber",  emoji: "▲" },
    { at: "assistant", cat: "ROUTER",   tier: 3, role: "General queries, intent routing",              model: "claude-haiku-4.5",  color: "violet", emoji: "●" },
  ],

  experts: [
    { id: "claude", name: "Claude Sonnet 4.5", vendor: "Anthropic", tier: 1, status: "live",  latency: 412, used: "2,419", cost: "$0.0034" },
    { id: "gpt4o",  name: "GPT-4o",            vendor: "OpenAI",    tier: 1, status: "live",  latency: 678, used: "1,184", cost: "$0.0029" },
    { id: "gemini", name: "Gemini 2.5 Pro",    vendor: "Google",    tier: 2, status: "live",  latency: 524, used: "1,866", cost: "$0.0021" },
    { id: "kimi",   name: "Kimi K2",           vendor: "Moonshot",  tier: 2, status: "live",  latency: 891, used: "412",   cost: "$0.0011" },
    { id: "groq",   name: "Groq Llama 3.3",    vendor: "Groq",      tier: 3, status: "live",  latency: 92,  used: "78",    cost: "$0.0004" },
    { id: "ollama", name: "Ollama (local)",    vendor: "Local",     tier: 3, status: "idle",  latency: 0,   used: "0",     cost: "$0.00" },
  ],

  channels: [
    { id: "cli",      name: "CLI",       status: "live", port: "tty",        sessions: 1, color: "amber" },
    { id: "webui",    name: "Web UI",    status: "live", port: "18790",      sessions: 1, color: "amber" },
    { id: "telegram", name: "Telegram",  status: "live", port: "@Endior_bot",sessions: 0, color: "amber" },
    { id: "zalo",     name: "Zalo",      status: "live", port: "Bot Endior", sessions: 0, color: "amber" },
    { id: "desktop",  name: "Desktop",   status: "live", port: "electron",   sessions: 1, color: "amber" },
  ],

  /* ───────────── EN copy ───────────── */
  en: {
    ui: {
      app_title: "Endiorbot",
      app_tagline: "SDLC Framework 6.3.1",
      window_title: "Endiorbot — Solo Dev Console",
      sidebar: {
        nav_main: "Workspace",
        nav_gov:  "Governance",
        nav_sys:  "System",
        dashboard: "Dashboard",
        chat:      "Chat",
        projects:  "Projects",
        gates:     "Gates",
        experts:   "Experts",
        junior:    "Junior Hub",
        settings:  "Settings",
      },
      footer: {
        gateway: "Gateway",
        connected: "Connected",
        sprint: "Sprint",
        tests: "tests passing",
      },
      common: {
        new: "New",
        send: "Send",
        run:  "Run",
        save: "Save",
        cancel: "Cancel",
        edit: "Edit",
        more: "More",
        details: "Details",
        evidence: "Evidence",
        rerun: "Re-run",
        ago_min: "min ago",
        ago_hour: "h ago",
        ago_day: "d ago",
        view_all: "View all",
        all: "All",
        search_placeholder: "Search agents, commands, files…",
        msg_placeholder: "Message an agent — try @pm or @consult",
      },
    },

    /* DASHBOARD */
    dashboard: {
      title: "Good evening, Tâm.",
      sub: "It's Tuesday, 10:42 PM. Sprint 144 · Day 3 of 5.",
      kpi: [
        { lbl: "Active sessions",     val: "3",       sub: "CLI · Web · Desktop", trend: "+1" },
        { lbl: "Tasks in flight",     val: "7",       sub: "across 2 projects",   trend: "−2" },
        { lbl: "Tests passing",       val: "8,142",   sub: "+ 47 since 09:14",    trend: "+47" },
        { lbl: "Spend (today)",       val: "$3.41",   sub: "of $20 budget",       trend: "17%" },
      ],
      now: {
        title: "Now playing",
        items: [
          { agent: "@coder",     act: "patching auth/refresh.ts",   chan: "CLI",     elapsed: "01:42", state: "active" },
          { agent: "@reviewer",  act: "reviewing PR #482",          chan: "Web UI",  elapsed: "00:54", state: "active" },
          { agent: "@researcher",act: "drafting ADR-019 (Postgres LISTEN/NOTIFY)", chan: "CLI", elapsed: "00:21", state: "queued" },
        ],
      },
      activity: {
        title: "Recent activity",
        rows: [
          { time: "22:38", icon: "✓", agent: "@pm",       text: "Drafted 4 stories for payment-gateway sprint",         meta: "G1 ready" },
          { time: "22:31", icon: "◇", agent: "@consult",  text: "Multi-model verdict: Postgres + LISTEN/NOTIFY",        meta: "8.4s · 4 experts" },
          { time: "22:24", icon: "▲", agent: "@architect",text: "ADR-018 locked: session storage policy",               meta: "G2 evidence" },
          { time: "22:11", icon: "✓", agent: "@tester",   text: "47 new tests added · 8,142 total passing",             meta: "+47 tests" },
          { time: "21:55", icon: "✓", agent: "@coder",    text: "Refactor: auth/refresh.ts race condition fix",         meta: "12 +/3 −" },
          { time: "21:47", icon: "◆", agent: "@cto",      text: "Architecture review: queue choice approved",           meta: "advisory" },
          { time: "21:32", icon: "✓", agent: "@devops",   text: "CI green on staging · deploy promoted",                meta: "build #1284" },
        ],
      },
      gates: {
        title: "Sprint 144 — Quality Gates",
        sub: "Day 3 of 5 · 2026-04-27",
      },
      cost: {
        title: "Today's spend",
        sub: "$3.41 of $20 daily budget · 17%",
        breakdown: [
          { vendor: "Anthropic", val: "$1.92", pct: 56, color: "amber" },
          { vendor: "Google",    val: "$0.74", pct: 22, color: "term"  },
          { vendor: "OpenAI",    val: "$0.61", pct: 18, color: "rust"  },
          { vendor: "Moonshot",  val: "$0.14", pct: 4,  color: "violet"},
        ],
      },
    },

    /* CHAT */
    chat: {
      title: "Chat",
      sidebar_title: "Sessions",
      new_chat: "New session",
      sessions: [
        { id: "s1", title: "Payment gateway sprint",     agent: "@pm",        time: "now",     active: true,  unread: 0 },
        { id: "s2", title: "Redis vs Postgres sessions", agent: "@consult",   time: "10m ago", active: false, unread: 0 },
        { id: "s3", title: "Auth refresh race fix",      agent: "@coder",     time: "32m ago", active: false, unread: 0 },
        { id: "s4", title: "ADR-018 storage policy",     agent: "@architect", time: "1h ago",  active: false, unread: 0 },
        { id: "s5", title: "Sprint 144 retro draft",     agent: "@pjm",       time: "yesterday", active: false, unread: 0 },
        { id: "s6", title: "Threat model: payment flow", agent: "@cso",       time: "yesterday", active: false, unread: 0 },
      ],
      header: {
        title: "Payment gateway sprint",
        sub: "Started 22:38 · 7 messages · CLI mirror active",
      },
      messages: [
        { who: "user", text: "plan payment gateway sprint", time: "22:38" },
        { who: "agent", agent: "pm", text: "I'll draft user stories for the payment gateway sprint. Pulling context from the last three sprints and the open architecture ADRs.", time: "22:38",
          tools: [
            { tool: "fs.read",    arg: "docs/adrs/ADR-014-payments.md" },
            { tool: "git.log",    arg: "--since=14d --grep=payment" },
            { tool: "fs.read",    arg: "src/payment/*.ts" },
          ]},
        { who: "agent", agent: "pm", text: "Drafted 4 stories. G1 readiness: PASS. Three risks flagged.", time: "22:39",
          card: { kind: "stories", items: [
            { id: "PG-201", title: "Stripe webhook idempotency",    points: 5, risk: "med" },
            { id: "PG-202", title: "Refund flow with retry",        points: 8, risk: "high" },
            { id: "PG-203", title: "Tax calc service extraction",   points: 13, risk: "high" },
            { id: "PG-204", title: "Audit log for payment events",  points: 3, risk: "low" },
          ]}
        },
        { who: "user", text: "@consult — should refunds use a queue or sync API?", time: "22:40" },
        { who: "agent", agent: "consult", text: "Querying 4 experts in parallel.", time: "22:40",
          consult: {
            ms: 8423,
            experts: [
              { name: "Claude Sonnet 4.5", verdict: "Queue", reason: "Refunds are eventually consistent. A queue with idempotency keys decouples Stripe latency from your API.", weight: 0.95 },
              { name: "GPT-4o",            verdict: "Queue", reason: "Match the async nature of bank settlement. Use BullMQ or Postgres LISTEN/NOTIFY.", weight: 0.92 },
              { name: "Gemini 2.5 Pro",    verdict: "Queue", reason: "Sync APIs amplify Stripe outages. A queue with DLQ gives you retry + audit for free.", weight: 0.88 },
              { name: "Kimi K2",           verdict: "Sync",  reason: "For solo dev simplicity, sync with retry middleware is fewer moving parts.", weight: 0.71 },
            ],
            consensus: "Queue (3/4 experts, weighted 0.92)",
            recommend: "Use a queue. ADR-019 draft attached.",
          }
        },
        { who: "user", text: "good. draft ADR-019 and assign PG-202 to @coder", time: "22:42" },
      ],
      slash: [
        { cmd: "@pm",         desc: "Plan, prioritize, draft stories" },
        { cmd: "@consult",    desc: "Multi-model expert verdict" },
        { cmd: "@coder",      desc: "Generate code, fix bugs" },
        { cmd: "@architect",  desc: "Draft ADR, system design" },
        { cmd: "/gate status",desc: "Show G0–G4 readiness" },
        { cmd: "/repos add",  desc: "Attach a repo to this workspace" },
      ],
    },

    /* PROJECTS */
    projects: {
      title: "Projects",
      sub: "Repos attached to this workspace · 2 active",
      new: "Attach repo",
      list: [
        { id: "endiorbot",
          name: "endiorbot",
          path: "~/dev/endiorbot",
          tier: "PRO",
          stack: "TypeScript · Node · Electron",
          sprint: 144,
          gate: "G2",
          tests: "8,142",
          loc: "94,218",
          adrs: 49,
          last: "2 min ago",
          health: "ok",
          active: true,
        },
        { id: "payment-gateway",
          name: "payment-gateway",
          path: "~/dev/clients/acme/payment-gateway",
          tier: "ENT",
          stack: "TypeScript · Postgres · Stripe",
          sprint: 12,
          gate: "G1",
          tests: "1,684",
          loc: "31,402",
          adrs: 14,
          last: "1 h ago",
          health: "warn",
          active: true,
        },
        { id: "lab-notes",
          name: "lab-notes",
          path: "~/dev/personal/lab-notes",
          tier: "LITE",
          stack: "Astro · MDX",
          sprint: null,
          gate: null,
          tests: "32",
          loc: "4,118",
          adrs: 0,
          last: "3 d ago",
          health: "idle",
          active: false,
        },
      ],
    },

    /* GATES */
    gates: {
      title: "Quality Gates",
      sub: "Sprint 144 · payment-gateway · Day 3 of 5",
      legend: { pass: "PASS", fail: "FAIL", pend: "PENDING", skip: "SKIP" },
      list: [
        { id: "G0", name: "Concept",   status: "pass", owner: "@pm",        passed_at: "2026-04-25 09:12",
          checks: [
            { ok: true,  text: "Problem framed in PRD" },
            { ok: true,  text: "Stakeholders identified" },
            { ok: true,  text: "Initial scope agreed" },
            { ok: true,  text: "Tier classified (ENT)" },
          ],
          evidence: ["docs/prd-payments.md", "docs/stakeholders.md"],
        },
        { id: "G1", name: "Plan",      status: "pass", owner: "@pm",        passed_at: "2026-04-26 14:38",
          checks: [
            { ok: true,  text: "Backlog drafted (4 stories, 29 pts)" },
            { ok: true,  text: "Risks identified & ranked" },
            { ok: true,  text: "Sprint shape: 5d, 1 dev, 1 reviewer" },
            { ok: true,  text: "Definition of Done agreed" },
          ],
          evidence: ["sprint-144/backlog.md", "sprint-144/risks.md"],
        },
        { id: "G2", name: "Design",    status: "pend", owner: "@architect", passed_at: null,
          checks: [
            { ok: true,  text: "ADR-018 storage policy locked" },
            { ok: true,  text: "API contract drafted" },
            { ok: false, text: "ADR-019 queue choice — draft only" },
            { ok: false, text: "Threat model not yet reviewed by @cso" },
          ],
          evidence: ["docs/adrs/ADR-018.md", "docs/adrs/ADR-019.draft.md"],
        },
        { id: "G3", name: "Build",     status: "skip", owner: "@coder",     passed_at: null,
          checks: [
            { ok: false, text: "Awaiting G2" },
          ],
          evidence: [],
        },
        { id: "G4", name: "Ship",      status: "skip", owner: "@devops",    passed_at: null,
          checks: [
            { ok: false, text: "Awaiting G3" },
          ],
          evidence: [],
        },
      ],
    },

    /* EXPERTS */
    experts: {
      title: "Experts",
      sub: "LLM providers · 5 live · 1 idle · circuit breakers nominal",
      consult_title: "Last consultation",
      consult_sub: "8.4s · 4 experts · weighted consensus",
      header: ["Expert", "Vendor", "Tier", "Status", "Latency", "Calls today", "Spend today"],
    },

    /* JUNIOR HUB */
    junior: {
      title: "Junior Hub",
      sub: "Authoring view for SOUL templates · 14 active · 2 drafts",
      new: "New SOUL",
      filters: ["All", "Advisor", "Executor", "Router", "Drafts"],
      cards_title: "Active SOULs",
      drafts: [
        { name: "@scribe",   role: "Documentation generator (auto-RFC)",    tier: 2, since: "2 d ago" },
        { name: "@migrator", role: "Schema migration planner with rollback",tier: 2, since: "5 d ago" },
      ],
    },

    /* SETTINGS */
    settings: {
      title: "Settings",
      sub: "Gateway · providers · channels · keys",
      groups: [
        { h: "Gateway",
          rows: [
            { lbl: "WebSocket endpoint",    val: "ws://127.0.0.1:18790",          kind: "code" },
            { lbl: "Protocol",              val: "JSON-RPC 2.0",                  kind: "text" },
            { lbl: "PID lockfile",          val: "~/.endiorbot/gateway.pid",      kind: "code" },
            { lbl: "Auto-start on boot",    val: true,                            kind: "toggle" },
            { lbl: "Single-instance guard", val: true,                            kind: "toggle" },
          ]
        },
        { h: "Providers",
          rows: [
            { lbl: "Anthropic API key",  val: "sk-ant-•••••••••••a4f2", kind: "secret", status: "ok" },
            { lbl: "OpenAI API key",     val: "sk-•••••••••••82c1",     kind: "secret", status: "ok" },
            { lbl: "Google API key",     val: "AIza•••••••••••P9k",     kind: "secret", status: "ok" },
            { lbl: "Moonshot API key",   val: "msk-•••••••••••e4d",     kind: "secret", status: "ok" },
            { lbl: "Groq API key",       val: "gsk_•••••••••••11a",     kind: "secret", status: "ok" },
            { lbl: "Ollama base URL",    val: "http://127.0.0.1:11434", kind: "code",   status: "idle" },
          ]
        },
        { h: "Channels",
          rows: [
            { lbl: "Web UI",     val: "Enabled · :18790", kind: "toggle-text", on: true },
            { lbl: "Telegram",   val: "@Endior_bot",      kind: "toggle-text", on: true },
            { lbl: "Zalo",       val: "Bot Endior",       kind: "toggle-text", on: true },
            { lbl: "Desktop",    val: "Auto-start gateway", kind: "toggle-text", on: true },
          ]
        },
        { h: "Budget",
          rows: [
            { lbl: "Daily spend cap",   val: "$20.00", kind: "number" },
            { lbl: "Per-call cap",      val: "$0.50",  kind: "number" },
            { lbl: "Circuit breaker",   val: "5 fails / 60s", kind: "text" },
            { lbl: "OTT timeout",       val: "60s hard",      kind: "text" },
          ]
        },
      ],
    },

    /* WEB UI */
    webui: {
      window_title: "localhost:18790 · Endiorbot Web UI",
      header_left: "endiorbot",
      header_right: "ws://127.0.0.1:18790 · connected",
      sidebar_title: "Sessions",
      composer_placeholder: "Try @pm, @consult, /gate status…",
      session_active: "Payment gateway sprint",
      hint: "tip: shift + ↵ for newline · / for commands · @ for agents",
    },
  },

  /* ───────────── VI copy ───────────── */
  vi: {
    ui: {
      app_title: "Endiorbot",
      app_tagline: "SDLC Framework 6.3.1",
      window_title: "Endiorbot — Bảng điều khiển Solo Dev",
      sidebar: {
        nav_main: "Không gian làm việc",
        nav_gov:  "Quản trị",
        nav_sys:  "Hệ thống",
        dashboard: "Tổng quan",
        chat:      "Trò chuyện",
        projects:  "Dự án",
        gates:     "Cổng chất lượng",
        experts:   "Chuyên gia",
        junior:    "Junior Hub",
        settings:  "Cài đặt",
      },
      footer: {
        gateway: "Gateway",
        connected: "Đã kết nối",
        sprint: "Sprint",
        tests: "test pass",
      },
      common: {
        new: "Tạo mới",
        send: "Gửi",
        run:  "Chạy",
        save: "Lưu",
        cancel: "Hủy",
        edit: "Sửa",
        more: "Thêm",
        details: "Chi tiết",
        evidence: "Bằng chứng",
        rerun: "Chạy lại",
        ago_min: "phút trước",
        ago_hour: "giờ trước",
        ago_day: "ngày trước",
        view_all: "Xem tất cả",
        all: "Tất cả",
        search_placeholder: "Tìm agent, lệnh, file…",
        msg_placeholder: "Nhắn cho agent — thử @pm hoặc @consult",
      },
    },

    dashboard: {
      title: "Chào buổi tối, Tâm.",
      sub: "Thứ ba, 22:42. Sprint 144 · Ngày 3 / 5.",
      kpi: [
        { lbl: "Phiên đang hoạt động", val: "3",     sub: "CLI · Web · Desktop", trend: "+1" },
        { lbl: "Task đang chạy",       val: "7",     sub: "trên 2 dự án",        trend: "−2" },
        { lbl: "Test pass",            val: "8.142", sub: "+ 47 từ 09:14",       trend: "+47" },
        { lbl: "Chi phí hôm nay",      val: "$3,41", sub: "trên ngân sách $20",  trend: "17%" },
      ],
      now: {
        title: "Đang chạy",
        items: [
          { agent: "@coder",     act: "vá auth/refresh.ts",                          chan: "CLI",     elapsed: "01:42", state: "active" },
          { agent: "@reviewer",  act: "review PR #482",                              chan: "Web UI",  elapsed: "00:54", state: "active" },
          { agent: "@researcher",act: "soạn ADR-019 (Postgres LISTEN/NOTIFY)",       chan: "CLI",     elapsed: "00:21", state: "queued" },
        ],
      },
      activity: {
        title: "Hoạt động gần đây",
        rows: [
          { time: "22:38", icon: "✓", agent: "@pm",       text: "Đã soạn 4 story cho sprint payment-gateway",      meta: "Sẵn G1" },
          { time: "22:31", icon: "◇", agent: "@consult",  text: "Đa-mô-hình đồng thuận: Postgres + LISTEN/NOTIFY", meta: "8.4s · 4 chuyên gia" },
          { time: "22:24", icon: "▲", agent: "@architect",text: "Khóa ADR-018: chính sách lưu session",            meta: "Bằng chứng G2" },
          { time: "22:11", icon: "✓", agent: "@tester",   text: "Thêm 47 test mới · tổng 8.142 pass",              meta: "+47 test" },
          { time: "21:55", icon: "✓", agent: "@coder",    text: "Refactor: sửa race auth/refresh.ts",              meta: "12 +/3 −" },
          { time: "21:47", icon: "◆", agent: "@cto",      text: "Review kiến trúc: chấp thuận lựa chọn queue",     meta: "tư vấn" },
          { time: "21:32", icon: "✓", agent: "@devops",   text: "CI xanh trên staging · đẩy lên deploy",           meta: "build #1284" },
        ],
      },
      gates: {
        title: "Sprint 144 — Cổng chất lượng",
        sub: "Ngày 3 / 5 · 2026-04-27",
      },
      cost: {
        title: "Chi phí hôm nay",
        sub: "$3,41 trên ngân sách ngày $20 · 17%",
        breakdown: [
          { vendor: "Anthropic", val: "$1,92", pct: 56, color: "amber" },
          { vendor: "Google",    val: "$0,74", pct: 22, color: "term"  },
          { vendor: "OpenAI",    val: "$0,61", pct: 18, color: "rust"  },
          { vendor: "Moonshot",  val: "$0,14", pct: 4,  color: "violet"},
        ],
      },
    },

    chat: {
      title: "Trò chuyện",
      sidebar_title: "Phiên",
      new_chat: "Phiên mới",
      sessions: [
        { id: "s1", title: "Sprint payment gateway",        agent: "@pm",        time: "ngay",      active: true,  unread: 0 },
        { id: "s2", title: "Redis hay Postgres cho session",agent: "@consult",   time: "10p trước", active: false, unread: 0 },
        { id: "s3", title: "Sửa race auth refresh",         agent: "@coder",     time: "32p trước", active: false, unread: 0 },
        { id: "s4", title: "ADR-018 chính sách lưu trữ",    agent: "@architect", time: "1g trước",  active: false, unread: 0 },
        { id: "s5", title: "Bản nháp retro Sprint 144",     agent: "@pjm",       time: "hôm qua",   active: false, unread: 0 },
        { id: "s6", title: "Threat model: luồng payment",   agent: "@cso",       time: "hôm qua",   active: false, unread: 0 },
      ],
      header: {
        title: "Sprint payment gateway",
        sub: "Bắt đầu 22:38 · 7 tin nhắn · CLI mirror đang bật",
      },
      messages: [
        { who: "user", text: "lên kế hoạch sprint payment gateway", time: "22:38" },
        { who: "agent", agent: "pm", text: "Tôi sẽ soạn user story cho sprint payment gateway. Đang đọc ngữ cảnh từ 3 sprint gần nhất và các ADR đang mở.", time: "22:38",
          tools: [
            { tool: "fs.read",    arg: "docs/adrs/ADR-014-payments.md" },
            { tool: "git.log",    arg: "--since=14d --grep=payment" },
            { tool: "fs.read",    arg: "src/payment/*.ts" },
          ]},
        { who: "agent", agent: "pm", text: "Đã soạn 4 story. G1 sẵn sàng: PASS. Phát hiện 3 rủi ro.", time: "22:39",
          card: { kind: "stories", items: [
            { id: "PG-201", title: "Stripe webhook idempotency",    points: 5,  risk: "med" },
            { id: "PG-202", title: "Luồng refund kèm retry",        points: 8,  risk: "high" },
            { id: "PG-203", title: "Tách dịch vụ tính thuế",        points: 13, risk: "high" },
            { id: "PG-204", title: "Audit log sự kiện thanh toán",  points: 3,  risk: "low" },
          ]}
        },
        { who: "user", text: "@consult — refund nên dùng queue hay sync API?", time: "22:40" },
        { who: "agent", agent: "consult", text: "Đang truy vấn 4 chuyên gia song song.", time: "22:40",
          consult: {
            ms: 8423,
            experts: [
              { name: "Claude Sonnet 4.5", verdict: "Queue", reason: "Refund là eventually consistent. Queue + idempotency key tách độ trễ Stripe khỏi API của bạn.",  weight: 0.95 },
              { name: "GPT-4o",            verdict: "Queue", reason: "Khớp tính bất đồng bộ của settlement ngân hàng. Dùng BullMQ hoặc Postgres LISTEN/NOTIFY.",         weight: 0.92 },
              { name: "Gemini 2.5 Pro",    verdict: "Queue", reason: "Sync API khuếch đại sự cố Stripe. Queue + DLQ cho bạn retry và audit miễn phí.",                   weight: 0.88 },
              { name: "Kimi K2",           verdict: "Sync",  reason: "Với solo dev, sync + retry middleware ít thành phần phải bảo trì hơn.",                            weight: 0.71 },
            ],
            consensus: "Queue (3/4 chuyên gia, trọng số 0.92)",
            recommend: "Dùng queue. Bản nháp ADR-019 đính kèm.",
          }
        },
        { who: "user", text: "ok. soạn ADR-019 và giao PG-202 cho @coder", time: "22:42" },
      ],
      slash: [
        { cmd: "@pm",         desc: "Lên kế hoạch, sắp ưu tiên, soạn story" },
        { cmd: "@consult",    desc: "Đa-mô-hình đồng thuận chuyên gia" },
        { cmd: "@coder",      desc: "Sinh code, sửa bug" },
        { cmd: "@architect",  desc: "Soạn ADR, thiết kế hệ thống" },
        { cmd: "/gate status",desc: "Xem trạng thái G0–G4" },
        { cmd: "/repos add",  desc: "Đính kèm repo vào workspace" },
      ],
    },

    projects: {
      title: "Dự án",
      sub: "Repo gắn vào workspace · 2 đang hoạt động",
      new: "Đính kèm repo",
      list: [
        { id: "endiorbot",
          name: "endiorbot",
          path: "~/dev/endiorbot",
          tier: "PRO",
          stack: "TypeScript · Node · Electron",
          sprint: 144,
          gate: "G2",
          tests: "8.142",
          loc: "94.218",
          adrs: 49,
          last: "2 phút trước",
          health: "ok",
          active: true,
        },
        { id: "payment-gateway",
          name: "payment-gateway",
          path: "~/dev/clients/acme/payment-gateway",
          tier: "ENT",
          stack: "TypeScript · Postgres · Stripe",
          sprint: 12,
          gate: "G1",
          tests: "1.684",
          loc: "31.402",
          adrs: 14,
          last: "1 giờ trước",
          health: "warn",
          active: true,
        },
        { id: "lab-notes",
          name: "lab-notes",
          path: "~/dev/personal/lab-notes",
          tier: "LITE",
          stack: "Astro · MDX",
          sprint: null,
          gate: null,
          tests: "32",
          loc: "4.118",
          adrs: 0,
          last: "3 ngày trước",
          health: "idle",
          active: false,
        },
      ],
    },

    gates: {
      title: "Cổng chất lượng",
      sub: "Sprint 144 · payment-gateway · Ngày 3 / 5",
      legend: { pass: "PASS", fail: "FAIL", pend: "ĐANG CHỜ", skip: "BỎ QUA" },
      list: [
        { id: "G0", name: "Concept",   status: "pass", owner: "@pm",        passed_at: "2026-04-25 09:12",
          checks: [
            { ok: true,  text: "Vấn đề được mô tả trong PRD" },
            { ok: true,  text: "Đã xác định stakeholder" },
            { ok: true,  text: "Đã thống nhất scope ban đầu" },
            { ok: true,  text: "Đã phân tier (ENT)" },
          ],
          evidence: ["docs/prd-payments.md", "docs/stakeholders.md"],
        },
        { id: "G1", name: "Plan",      status: "pass", owner: "@pm",        passed_at: "2026-04-26 14:38",
          checks: [
            { ok: true,  text: "Đã soạn backlog (4 story, 29 điểm)" },
            { ok: true,  text: "Đã xác định và xếp hạng rủi ro" },
            { ok: true,  text: "Hình dáng sprint: 5 ngày, 1 dev, 1 reviewer" },
            { ok: true,  text: "Đã chốt Definition of Done" },
          ],
          evidence: ["sprint-144/backlog.md", "sprint-144/risks.md"],
        },
        { id: "G2", name: "Design",    status: "pend", owner: "@architect", passed_at: null,
          checks: [
            { ok: true,  text: "Đã khóa ADR-018 chính sách lưu trữ" },
            { ok: true,  text: "Đã soạn API contract" },
            { ok: false, text: "ADR-019 lựa chọn queue — mới ở dạng nháp" },
            { ok: false, text: "@cso chưa review threat model" },
          ],
          evidence: ["docs/adrs/ADR-018.md", "docs/adrs/ADR-019.draft.md"],
        },
        { id: "G3", name: "Build",     status: "skip", owner: "@coder",     passed_at: null,
          checks: [{ ok: false, text: "Đợi G2" }], evidence: [],
        },
        { id: "G4", name: "Ship",      status: "skip", owner: "@devops",    passed_at: null,
          checks: [{ ok: false, text: "Đợi G3" }], evidence: [],
        },
      ],
    },

    experts: {
      title: "Chuyên gia",
      sub: "Nhà cung cấp LLM · 5 hoạt động · 1 idle · circuit breaker bình thường",
      consult_title: "Tư vấn gần nhất",
      consult_sub: "8.4s · 4 chuyên gia · đồng thuận trọng số",
      header: ["Chuyên gia", "Nhà cung cấp", "Tier", "Trạng thái", "Latency", "Cuộc gọi hôm nay", "Chi phí hôm nay"],
    },

    junior: {
      title: "Junior Hub",
      sub: "Trình soạn SOUL template · 14 đang hoạt động · 2 bản nháp",
      new: "SOUL mới",
      filters: ["Tất cả", "Advisor", "Executor", "Router", "Bản nháp"],
      cards_title: "SOUL đang hoạt động",
      drafts: [
        { name: "@scribe",   role: "Sinh tài liệu (auto-RFC)",                tier: 2, since: "2 ngày trước" },
        { name: "@migrator", role: "Lập kế hoạch migration schema kèm rollback", tier: 2, since: "5 ngày trước" },
      ],
    },

    settings: {
      title: "Cài đặt",
      sub: "Gateway · nhà cung cấp · kênh · key",
      groups: [
        { h: "Gateway",
          rows: [
            { lbl: "Endpoint WebSocket",       val: "ws://127.0.0.1:18790",     kind: "code" },
            { lbl: "Giao thức",                val: "JSON-RPC 2.0",             kind: "text" },
            { lbl: "PID lockfile",             val: "~/.endiorbot/gateway.pid", kind: "code" },
            { lbl: "Tự khởi động khi bật máy", val: true,                       kind: "toggle" },
            { lbl: "Khóa single-instance",     val: true,                       kind: "toggle" },
          ]
        },
        { h: "Nhà cung cấp",
          rows: [
            { lbl: "Anthropic API key", val: "sk-ant-•••••••••••a4f2", kind: "secret", status: "ok" },
            { lbl: "OpenAI API key",    val: "sk-•••••••••••82c1",     kind: "secret", status: "ok" },
            { lbl: "Google API key",    val: "AIza•••••••••••P9k",     kind: "secret", status: "ok" },
            { lbl: "Moonshot API key",  val: "msk-•••••••••••e4d",     kind: "secret", status: "ok" },
            { lbl: "Groq API key",      val: "gsk_•••••••••••11a",     kind: "secret", status: "ok" },
            { lbl: "Ollama base URL",   val: "http://127.0.0.1:11434", kind: "code",   status: "idle" },
          ]
        },
        { h: "Kênh",
          rows: [
            { lbl: "Web UI",   val: "Bật · :18790",        kind: "toggle-text", on: true },
            { lbl: "Telegram", val: "@Endior_bot",         kind: "toggle-text", on: true },
            { lbl: "Zalo",     val: "Bot Endior",          kind: "toggle-text", on: true },
            { lbl: "Desktop",  val: "Tự khởi động gateway",kind: "toggle-text", on: true },
          ]
        },
        { h: "Ngân sách",
          rows: [
            { lbl: "Trần chi phí ngày", val: "$20.00", kind: "number" },
            { lbl: "Trần mỗi cuộc gọi", val: "$0.50",  kind: "number" },
            { lbl: "Circuit breaker",   val: "5 lỗi / 60s", kind: "text" },
            { lbl: "OTT timeout",       val: "60s cứng",    kind: "text" },
          ]
        },
      ],
    },

    webui: {
      window_title: "localhost:18790 · Endiorbot Web UI",
      header_left: "endiorbot",
      header_right: "ws://127.0.0.1:18790 · đã kết nối",
      sidebar_title: "Phiên",
      composer_placeholder: "Thử @pm, @consult, /gate status…",
      session_active: "Sprint payment gateway",
      hint: "mẹo: shift + ↵ để xuống dòng · / để xem lệnh · @ để gọi agent",
    },
  },
};
