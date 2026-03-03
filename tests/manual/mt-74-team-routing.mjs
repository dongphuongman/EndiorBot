/**
 * Sprint 74 Manual Tests — Team Agent Routing
 * Run: node tests/manual/mt-74-team-routing.mjs
 */

import { createAgentRouter, resetAgentRouter } from "../../dist/agents/orchestrator/agent-router.js";
import { resetTeamRegistry } from "../../dist/agents/orchestrator/team-registry.js";

function reset() {
  resetAgentRouter();
  resetTeamRegistry();
}

async function runManualTests() {
  const results = [];

  // MT-74-01: @planning routes to PM with team context (STANDARD)
  reset();
  const r1 = createAgentRouter({ tier: "STANDARD" });
  const t1 = await r1.route('@planning "plan auth system"');
  results.push({
    id: "MT-74-01",
    desc: "@planning -> PM with team context (STANDARD)",
    pass: t1.success && t1.decision.agent === "pm" && t1.decision.isTeam === true && t1.decision.soul.content.includes("## Team Context"),
    detail: t1.success ? `agent=${t1.decision.agent}, isTeam=${t1.decision.isTeam}, hasContext=${t1.decision.soul.content.includes("## Team Context")}` : t1.error.message,
  });

  // MT-74-02: @dev routes to Coder with teammates (STANDARD)
  reset();
  const r2 = createAgentRouter({ tier: "STANDARD" });
  const t2 = await r2.route('@dev "implement login"');
  results.push({
    id: "MT-74-02",
    desc: "@dev -> Coder with team context (STANDARD)",
    pass: t2.success && t2.decision.agent === "coder" && t2.decision.isTeam === true && t2.decision.soul.content.includes("### Teammates"),
    detail: t2.success ? `agent=${t2.decision.agent}, hasTeammates=${t2.decision.soul.content.includes("### Teammates")}` : t2.error.message,
  });

  // MT-74-03: @qa routes to Reviewer (sole member) (STANDARD)
  reset();
  const r3 = createAgentRouter({ tier: "STANDARD" });
  const t3 = await r3.route('@qa "review PR"');
  results.push({
    id: "MT-74-03",
    desc: "@qa -> Reviewer sole member (STANDARD)",
    pass: t3.success && t3.decision.agent === "reviewer" && t3.decision.soul.content.includes("sole member"),
    detail: t3.success ? `agent=${t3.decision.agent}, soleMember=${t3.decision.soul.content.includes("sole member")}` : t3.error.message,
  });

  // MT-74-04: @pm routes directly (agent-first, no team)
  reset();
  const r4 = createAgentRouter({ tier: "STANDARD" });
  const t4 = await r4.route('@pm "plan"');
  const noTeamContext = t4.success && (t4.decision.soul.content.includes("## Team Context") === false);
  results.push({
    id: "MT-74-04",
    desc: "@pm -> PM direct (agent-first, isTeam=false)",
    pass: t4.success && t4.decision.agent === "pm" && t4.decision.isTeam === false && noTeamContext,
    detail: t4.success ? `agent=${t4.decision.agent}, isTeam=${t4.decision.isTeam}, noContext=${noTeamContext}` : t4.error.message,
  });

  // MT-74-05: @design routes to Architect with teammates (PRO)
  reset();
  const r5 = createAgentRouter({ tier: "PROFESSIONAL" });
  const t5 = await r5.route('@design "create wireframes"');
  const hasTeammates = t5.success && t5.decision.soul.content.includes("@pm") && t5.decision.soul.content.includes("@coder");
  results.push({
    id: "MT-74-05",
    desc: "@design -> Architect + pm,coder teammates (PRO)",
    pass: t5.success && t5.decision.agent === "architect" && hasTeammates,
    detail: t5.success ? `agent=${t5.decision.agent}, hasTeammates=${hasTeammates}` : t5.error.message,
  });

  // MT-74-06: @ops fails in STANDARD, works in ENTERPRISE
  reset();
  const r6a = createAgentRouter({ tier: "STANDARD" });
  const t6a = await r6a.route('@ops "deploy"');
  reset();
  const r6b = createAgentRouter({ tier: "ENTERPRISE" });
  const t6b = await r6b.route('@ops "deploy"');
  results.push({
    id: "MT-74-06",
    desc: "@ops fails STANDARD, works ENTERPRISE",
    pass: (t6a.success === false) && t6b.success && t6b.decision.agent === "devops",
    detail: `STD=${t6a.success?"UNEXPECTED_PASS":"FAIL_OK"}, ENT=${t6b.success?"PASS":"FAIL"} agent=${t6b.success?t6b.decision.agent:"N/A"}`,
  });

  // MT-74-07: @executive -> CTO(PRO) vs CEO(ENT)
  reset();
  const r7a = createAgentRouter({ tier: "PROFESSIONAL" });
  const t7a = await r7a.route('@executive "review"');
  reset();
  const r7b = createAgentRouter({ tier: "ENTERPRISE" });
  const t7b = await r7b.route('@executive "review"');
  results.push({
    id: "MT-74-07",
    desc: "@executive -> CTO(PRO) vs CEO(ENT)",
    pass: t7a.success && t7a.decision.agent === "cto" && t7b.success && t7b.decision.agent === "ceo",
    detail: `PRO=${t7a.success?t7a.decision.agent:"FAIL"}, ENT=${t7b.success?t7b.decision.agent:"FAIL"}`,
  });

  // MT-74-08: setTier LITE->STANDARD enables @planning
  reset();
  const r8 = createAgentRouter({ tier: "LITE" });
  const t8a = await r8.route('@planning "plan"');
  r8.setTier("STANDARD");
  const t8b = await r8.route('@planning "plan"');
  results.push({
    id: "MT-74-08",
    desc: "setTier LITE->STANDARD enables @planning",
    pass: (t8a.success === false) && t8b.success && t8b.decision.agent === "pm",
    detail: `LITE=${t8a.success?"UNEXPECTED":"FAIL_OK"}, STD=${t8b.success?"PASS":"FAIL"} agent=${t8b.success?t8b.decision.agent:"N/A"}`,
  });

  // Print results
  console.log("\n=== Sprint 74 Manual Tests — Team Agent Routing ===\n");
  let passed = 0;
  for (const r of results) {
    const icon = r.pass ? "PASS" : "FAIL";
    if (r.pass) passed++;
    console.log(`[${icon}] ${r.id} | ${r.desc}`);
    console.log(`       ${r.detail}`);
  }
  console.log(`\nResult: ${passed}/${results.length} passed\n`);
  process.exit(passed === results.length ? 0 : 1);
}

runManualTests().catch(console.error);
