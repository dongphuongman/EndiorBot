/**
 * Junior Hub Page - Guided workflows and developer learning center
 */

const PLANNED_FEATURES = [
  {
    title: "Guided Workflows",
    description: "Step-by-step task flows with AI assistance — from ticket to merged PR.",
  },
  {
    title: "Code Review Mode",
    description: "Interactive line-by-line review with explanations and best-practice suggestions.",
  },
  {
    title: "Learning Exercises",
    description: "Bite-sized coding challenges generated from real project patterns.",
  },
  {
    title: "Onboarding Assistant",
    description: "Auto-generated codebase tour and architecture walkthroughs for new contributors.",
  },
  {
    title: "Fix Coach",
    description: "Root-cause analysis for failing tests and lint errors with guided fixes.",
  },
];

export function JuniorHubPage() {
  return (
    <div>
      {/* Sprint 147 T4: design-token aligned */}
      <div className="page-header">
        <h1>Junior Hub</h1>
        <p className="subtitle">Guided workflows, code review, and learning for junior developers</p>
      </div>

      {/* Coming soon banner */}
      <div className="card" style={{
        background: "linear-gradient(135deg, var(--violet-soft) 0%, var(--accent-soft) 100%)",
        borderColor: "rgba(181,156,255,0.25)",
        marginBottom: 28,
      }}>
        <span className="tier-pill t3" style={{ marginBottom: 12 }}>Coming Soon</span>
        <h2 style={{ fontSize: 20, fontWeight: 600, margin: "0 0 8px" }}>
          Accelerate junior developer growth
        </h2>
        <p className="muted" style={{ fontSize: 14, margin: 0, lineHeight: 1.6 }}>
          Junior Hub will embed AI coaching directly into the development workflow —
          reducing review cycles, improving code quality, and building lasting skills
          through real project work.
        </p>
      </div>

      {/* Planned features */}
      <h3 className="eyebrow" style={{ marginBottom: 14 }}>Planned Features</h3>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 32 }}>
        {PLANNED_FEATURES.map((feature) => (
          <div key={feature.title} className="card" style={{ padding: "16px 20px", display: "flex", alignItems: "flex-start", gap: 14 }}>
            <span className="dot" style={{ background: "var(--violet)", marginTop: 7 }} />
            <div>
              <p style={{ fontSize: 14, fontWeight: 600, margin: "0 0 4px" }}>{feature.title}</p>
              <p className="dim" style={{ fontSize: 13, margin: 0, lineHeight: 1.5 }}>{feature.description}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Footer CTA */}
      <div className="card" style={{ padding: "12px 16px", fontSize: 13 }}>
        <span className="dim">Want to contribute? </span>
        <span style={{ color: "var(--accent)" }}>github.com/endior-net/EndiorBot</span>
      </div>
    </div>
  );
}
