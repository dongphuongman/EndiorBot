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
    <div style={{ padding: "20px" }}>
      <h1 style={{ fontSize: "32px", marginBottom: "8px" }}>Junior Hub</h1>
      <p style={{ color: "#9ca3af", marginBottom: "28px" }}>
        Guided workflows, code review, and on-the-job learning for junior developers
      </p>

      {/* Coming soon banner */}
      <div style={{
        padding: "24px 28px",
        background: "linear-gradient(135deg, rgba(99,102,241,0.12) 0%, rgba(168,85,247,0.08) 100%)",
        border: "1px solid rgba(99,102,241,0.25)",
        borderRadius: "14px",
        marginBottom: "28px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "12px" }}>
          <span style={{
            fontSize: "11px",
            fontWeight: 600,
            padding: "3px 10px",
            borderRadius: "9999px",
            background: "rgba(168,85,247,0.2)",
            color: "#c084fc",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}>
            Coming Soon
          </span>
        </div>
        <h2 style={{ fontSize: "20px", fontWeight: 600, color: "#f3f4f6", margin: "0 0 8px 0" }}>
          Accelerate junior developer growth
        </h2>
        <p style={{ fontSize: "14px", color: "#9ca3af", margin: 0, lineHeight: "1.6" }}>
          Junior Hub will embed AI coaching directly into the development workflow —
          reducing review cycles, improving code quality, and building lasting skills
          through real project work.
        </p>
      </div>

      {/* Planned features */}
      <h3 style={{ fontSize: "14px", fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "14px" }}>
        Planned Features
      </h3>

      <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "32px" }}>
        {PLANNED_FEATURES.map((feature) => (
          <div
            key={feature.title}
            style={{
              padding: "16px 20px",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: "10px",
              display: "flex",
              alignItems: "flex-start",
              gap: "14px",
            }}
          >
            <span style={{
              width: "6px",
              height: "6px",
              borderRadius: "50%",
              background: "#6366f1",
              flexShrink: 0,
              marginTop: "7px",
            }} />
            <div>
              <p style={{ fontSize: "14px", fontWeight: 600, color: "#e5e7eb", margin: "0 0 4px 0" }}>
                {feature.title}
              </p>
              <p style={{ fontSize: "13px", color: "#6b7280", margin: 0, lineHeight: "1.5" }}>
                {feature.description}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Footer CTA */}
      <div style={{
        padding: "12px 16px",
        background: "rgba(255,255,255,0.04)",
        borderRadius: "8px",
        fontSize: "13px",
        color: "#6b7280",
      }}>
        Want to contribute?{" "}
        <span style={{ color: "#a5b4fc" }}>
          github.com/Minh-Tam-Solution/EndiorBot
        </span>
      </div>
    </div>
  );
}
