---
sprint: 146
status: DRAFT — blocked by Sprint 145 exit
start_date: TBD
planned_duration: 1-2d
framework: "6.3.1"
authority:
  proposer: "@pm"
  countersigners: []
  trigger: "Sprint 145 exit criteria met (keys rotated, CI green, 0 critical)"
previous_sprint: "Sprint 145 — Pre-Publish Hardening"
references:
  - docs/04-build/sprints/sprint-145-pre-publish-hardening.md
---

# Sprint 146 — Public Launch

## Context

Sprint 145 closed all pre-publish blockers (key rotation, CI/CD, vulnerability fixes). This sprint executes the public launch: flip repo visibility, npm publish, GitHub Release, and community outreach.

**Identity:** Solo Developer Power Tool — first public release as open-source.

---

## P0 — Launch Day (blocks community access)

### T1: Flip Repository to Public (~5min)

**Steps:**
1. GitHub → Settings → Danger Zone → Change visibility → Public
2. Verify repo is accessible at `https://github.com/Minh-Tam-Solution/EndiorBot`
3. Verify CI badge shows green

**Owner:** CEO
**Pre-condition:** Sprint 145 T1-T4 complete (keys rotated, CI green).

---

### T2: npm Publish (~15min)

**Steps:**
```bash
npm login                    # Login to npmjs.com
npm publish --access public  # Publish as `endiorbot`
```

**Verify:**
```bash
npx endiorbot --help         # Should work globally
npm info endiorbot            # Should show package metadata
```

**Owner:** CEO
**Success:** `npx endiorbot --help` works for anyone on the internet.

---

### T3: GitHub Release v0.1.0-beta.1 (~30min)

**Steps:**
1. GitHub → Releases → Draft a new release
2. Tag: `v0.1.0-beta.1`
3. Title: `EndiorBot v0.1.0-beta.1 — Solo Developer AI Orchestration Tool`
4. Body (release notes):

```markdown
## EndiorBot v0.1.0-beta.1

> Solo Developer AI Orchestration Tool — get answers in <30s instead of 30-60 min

First public beta release. EndiorBot integrates with Claude Code as an Agent Orchestrator with SDLC governance across 5 channels.

### Highlights

- **14 SOUL agents** — @pm, @architect, @coder, @reviewer, @tester + 9 more
- **5 channels** — CLI, Web, Telegram, Zalo, Desktop (Electron)
- **39 unified commands** — same commands work across all channels
- **SDLC Framework 6.3.1** — 10-stage lifecycle, quality gates, compliance automation
- **Multi-model consultation** — query Claude, GPT, Gemini, Kimi in parallel
- **Claude Code Bridge** — launch Claude Code sessions via tmux from any channel
- **Gateway hardening** — PID lockfile, circuit breaker, OTT 60s timeout
- **Desktop app** — Electron with gateway auto-start, API key management, 7 pages

### Quick Start

\`\`\`bash
npx endiorbot --help
npx endiorbot init --tier STANDARD
npx endiorbot serve
\`\`\`

### Stats

| Metric | Value |
|--------|-------|
| Tests | 8,124+ |
| Commands | 39 unified |
| ADRs | 49 |
| Sprint plans | 90+ |

### Documentation

- [Usage Guide](docs/07-operate/USAGE-GUIDE.md) — 20 workflows
- [Deploy Guide](docs/06-deploy/README.md) — Docker, npm, Desktop
- [Architecture](docs/02-design/README.md) — ADRs, technical specs

### Known Limitations (Beta)

- APIs may change between 0.x releases
- Desktop app requires manual `pnpm dev` (no prebuilt binaries yet)
- 2 moderate dev-only vulnerabilities (vite, brace-expansion)
- Checkpoint restore not yet implemented

### License

MIT — free for personal and commercial use.
```

**Owner:** @pm
**Success:** Release page shows on GitHub with tag.

---

## P1 — Launch Week (enhances community experience)

### T4: endior.net Landing Page (~2h)

**Options (pick one):**
- **A. GitHub Pages** — Simple `index.html` with project overview, link to GitHub
- **B. Docusaurus** — Full docs site from `docs/` folder
- **C. README redirect** — `endior.net` → `github.com/Minh-Tam-Solution/EndiorBot`

**Recommended:** Option C for launch (5min), then upgrade to B in Sprint 147.

**Owner:** @devops

---

### T5: Desktop App Release Build (~2h)

**What:** Build distributable binaries using `electron-builder`:
```bash
cd apps/desktop
pnpm build   # Produces: release/EndiorBot-1.0.0.dmg (macOS)
```

**Attach to GitHub Release** as downloadable assets:
- `EndiorBot-1.0.0-arm64.dmg` (macOS Apple Silicon)
- `EndiorBot-1.0.0-x64.dmg` (macOS Intel)

Windows/Linux builds deferred to Sprint 147 (need CI matrix).

**Owner:** @devops

---

### T6: Community README Enhancements (~3h)

**What:**
- Record 30s GIF demo of `endiorbot init` → `endiorbot serve` → Telegram chat
- Add "Why EndiorBot?" section with comparison to alternatives
- Add "Contributing" quick-start in README (point to CONTRIBUTING.md)
- Add "Star History" badge

**Owner:** @pm

---

## P2 — Post-Launch (Sprint 147+)

| Task | Sprint | Notes |
|------|--------|-------|
| Docusaurus docs site on endior.net | 147 | Full documentation site |
| Windows/Linux desktop builds | 147 | CI matrix for electron-builder |
| `endiorbot create-app` scaffolding command | 147 | Create new projects from templates |
| Dev.to article: "Building an AI Agent Orchestrator" | 147 | Community marketing |
| Semantic versioning automation | 148 | `semantic-release` + conventional commits |
| Plugin/extension system for custom agents | 148 | Community can add their own SOULs |

---

## Success Metrics (1 week post-launch)

| Metric | Target | How to Measure |
|--------|--------|----------------|
| GitHub stars | 50+ | GitHub API |
| npm installs | 100+ | npm stats |
| First external `endiorbot init` | Within 3 days | npm download count |
| First community issue | Within 1 week | GitHub Issues |
| First community PR | Within 2 weeks | GitHub PRs |

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Secrets in git history | ADR-049: history rewritten, keys rotated, SECURITY.md transparent |
| Beta instability | README clearly states "Beta: APIs may change" |
| Low adoption | Start with Dev.to article + Twitter announcement |
| Bad first impression | CI green + tests passing + desktop app working = credibility |

---

*EndiorBot | Solo Developer Power Tool | SDLC 6.3.1 | Sprint 146 Draft — 2026-04-27*
