/**
 * Sprint 74 Manual Tests — Dyad Repo (STANDARD tier)
 *
 * Tests team routing as dyad project would experience it.
 * Dyad is a STANDARD tier project managed by EndiorBot.
 *
 * Run: node tests/manual/mt-74-dyad-manual.mjs
 */

import { createAgentRouter, resetAgentRouter } from "../../dist/agents/orchestrator/agent-router.js";
import { resetTeamRegistry } from "../../dist/agents/orchestrator/team-registry.js";

function reset() {
  resetAgentRouter();
  resetTeamRegistry();
}

function pass(id, desc, detail) {
  console.log(`[PASS] ${id} | ${desc}`);
  console.log(`       ${detail}`);
  return true;
}

function fail(id, desc, detail) {
  console.log(`[FAIL] ${id} | ${desc}`);
  console.log(`       ${detail}`);
  return false;
}

async function runDyadTests() {
  const TIER = "STANDARD"; // Dyad project tier
  let passed = 0;
  let total = 0;

  console.log("\n=== Sprint 74 Manual Tests — Dyad Repo (STANDARD tier) ===\n");

  // ---------------------------------------------------------------
  // MT-D01: @planning in STANDARD → PM with team context
  // ---------------------------------------------------------------
  total++;
  reset();
  const r1 = createAgentRouter({ tier: TIER });
  const t1 = await r1.route('@planning "plan payment integration for dyad"');
  if (t1.success && t1.decision.agent === "pm" && t1.decision.isTeam && t1.decision.teamId === "planning") {
    const hasContext = t1.decision.soul.content.includes("## Team Context");
    const hasPlanning = t1.decision.soul.content.includes("Planning Team");
    if (hasContext && hasPlanning) {
      passed += pass("MT-D01", "@planning -> PM with Planning Team context",
        `agent=${t1.decision.agent}, teamId=${t1.decision.teamId}, teamName=${t1.decision.teamName}`);
    } else {
      fail("MT-D01", "@planning -> PM with Planning Team context",
        `hasContext=${hasContext}, hasPlanning=${hasPlanning}`);
    }
  } else {
    fail("MT-D01", "@planning -> PM with Planning Team context",
      t1.success ? `agent=${t1.decision.agent}, isTeam=${t1.decision.isTeam}` : t1.error.message);
  }

  // ---------------------------------------------------------------
  // MT-D02: @dev in STANDARD → Coder with teammates
  // ---------------------------------------------------------------
  total++;
  reset();
  const r2 = createAgentRouter({ tier: TIER });
  const t2 = await r2.route('@dev "implement auth module for dyad"');
  if (t2.success && t2.decision.agent === "coder" && t2.decision.isTeam && t2.decision.teamId === "dev") {
    const hasTeammates = t2.decision.soul.content.includes("### Teammates");
    const hasDelegation = t2.decision.soul.content.includes("### Delegation");
    if (hasTeammates && hasDelegation) {
      passed += pass("MT-D02", "@dev -> Coder with Development Team context",
        `agent=${t2.decision.agent}, teamId=${t2.decision.teamId}, teamName=${t2.decision.teamName}`);
    } else {
      fail("MT-D02", "@dev -> Coder with Development Team context",
        `hasTeammates=${hasTeammates}, hasDelegation=${hasDelegation}`);
    }
  } else {
    fail("MT-D02", "@dev -> Coder with Development Team context",
      t2.success ? `agent=${t2.decision.agent}` : t2.error.message);
  }

  // ---------------------------------------------------------------
  // MT-D03: @qa in STANDARD → Reviewer
  // ---------------------------------------------------------------
  total++;
  reset();
  const r3 = createAgentRouter({ tier: TIER });
  const t3 = await r3.route('@qa "review dyad PR #42"');
  if (t3.success && t3.decision.agent === "reviewer" && t3.decision.isTeam && t3.decision.teamId === "qa") {
    const hasSoleMember = t3.decision.soul.content.includes("sole member");
    if (hasSoleMember) {
      passed += pass("MT-D03", "@qa -> Reviewer (sole member in STANDARD)",
        `agent=${t3.decision.agent}, teamName=${t3.decision.teamName}, soleMember=true`);
    } else {
      fail("MT-D03", "@qa -> Reviewer (sole member in STANDARD)",
        `soleMember=${hasSoleMember} (expected true)`);
    }
  } else {
    fail("MT-D03", "@qa -> Reviewer (sole member in STANDARD)",
      t3.success ? `agent=${t3.decision.agent}` : t3.error.message);
  }

  // ---------------------------------------------------------------
  // MT-D04: @pm direct (agent-first, no team context)
  // ---------------------------------------------------------------
  total++;
  reset();
  const r4 = createAgentRouter({ tier: TIER });
  const t4 = await r4.route('@pm "plan dyad sprint 5"');
  if (t4.success && t4.decision.agent === "pm" && t4.decision.isTeam === false) {
    const noTeamContext = (t4.decision.soul.content.includes("## Team Context") === false);
    if (noTeamContext) {
      passed += pass("MT-D04", "@pm -> PM direct (agent-first, no team context)",
        `agent=${t4.decision.agent}, isTeam=false, noTeamContext=true`);
    } else {
      fail("MT-D04", "@pm -> PM direct (agent-first, no team context)",
        `noTeamContext=${noTeamContext} (unexpected team context injected)`);
    }
  } else {
    fail("MT-D04", "@pm -> PM direct (agent-first, no team context)",
      t4.success ? `isTeam=${t4.decision.isTeam}` : t4.error.message);
  }

  // ---------------------------------------------------------------
  // MT-D05: @coder direct (agent-first, not team)
  // ---------------------------------------------------------------
  total++;
  reset();
  const r5 = createAgentRouter({ tier: TIER });
  const t5 = await r5.route('@coder "fix dyad bug in auth"');
  if (t5.success && t5.decision.agent === "coder" && t5.decision.isTeam === false) {
    passed += pass("MT-D05", "@coder -> Coder direct (agent-first)",
      `agent=${t5.decision.agent}, isTeam=false, teamId=${t5.decision.teamId ?? "none"}`);
  } else {
    fail("MT-D05", "@coder -> Coder direct (agent-first)",
      t5.success ? `isTeam=${t5.decision.isTeam}` : t5.error.message);
  }

  // ---------------------------------------------------------------
  // MT-D06: @ops FAILS in STANDARD (not available)
  // ---------------------------------------------------------------
  total++;
  reset();
  const r6 = createAgentRouter({ tier: TIER });
  const t6 = await r6.route('@ops "deploy dyad to production"');
  if (t6.success === false) {
    passed += pass("MT-D06", "@ops fails in STANDARD tier (expected)",
      `error=${t6.error.code}: ${t6.error.message.substring(0, 60)}...`);
  } else {
    fail("MT-D06", "@ops fails in STANDARD tier (expected)",
      `Unexpected success: agent=${t6.decision.agent}`);
  }

  // ---------------------------------------------------------------
  // MT-D07: @design FAILS in STANDARD (not available)
  // ---------------------------------------------------------------
  total++;
  reset();
  const r7 = createAgentRouter({ tier: TIER });
  const t7 = await r7.route('@design "design dyad UI"');
  if (t7.success === false) {
    passed += pass("MT-D07", "@design fails in STANDARD tier (expected)",
      `error=${t7.error.code}: ${t7.error.message.substring(0, 60)}...`);
  } else {
    fail("MT-D07", "@design fails in STANDARD tier (expected)",
      `Unexpected success: agent=${t7.decision.agent}`);
  }

  // ---------------------------------------------------------------
  // MT-D08: @architect direct (available in STANDARD)
  // ---------------------------------------------------------------
  total++;
  reset();
  const r8 = createAgentRouter({ tier: TIER });
  const t8 = await r8.route('@architect "design dyad database schema"');
  if (t8.success && t8.decision.agent === "architect" && t8.decision.isTeam === false) {
    passed += pass("MT-D08", "@architect -> Architect direct (STANDARD)",
      `agent=${t8.decision.agent}, isTeam=false, tier=${t8.decision.tier}`);
  } else {
    fail("MT-D08", "@architect -> Architect direct (STANDARD)",
      t8.success ? `isTeam=${t8.decision.isTeam}` : t8.error.message);
  }

  // ---------------------------------------------------------------
  // MT-D09: SOUL content validation — @planning team charter loaded
  // ---------------------------------------------------------------
  total++;
  reset();
  const r9 = createAgentRouter({ tier: TIER });
  const t9 = await r9.route('@planning "validate SDLC compliance"');
  if (t9.success) {
    const soul = t9.decision.soul.content;
    const hasCharter = soul.includes("### Team Charter");
    const hasLeader = soul.includes("**leader**");
    const hasDelegation = soul.includes("### Delegation");
    if (hasCharter && hasLeader && hasDelegation) {
      passed += pass("MT-D09", "SOUL enrichment: charter + leader + delegation",
        `hasCharter=${hasCharter}, hasLeader=${hasLeader}, hasDelegation=${hasDelegation}`);
    } else {
      fail("MT-D09", "SOUL enrichment: charter + leader + delegation",
        `hasCharter=${hasCharter}, hasLeader=${hasLeader}, hasDelegation=${hasDelegation}`);
    }
  } else {
    fail("MT-D09", "SOUL enrichment: charter + leader + delegation", t9.error.message);
  }

  // ---------------------------------------------------------------
  // MT-D10: Task classification works for team routes
  // ---------------------------------------------------------------
  total++;
  reset();
  const r10 = createAgentRouter({ tier: TIER });
  const t10 = await r10.route('@dev "implement payment gateway integration"');
  if (t10.success && t10.decision.classification) {
    const c = t10.decision.classification;
    if (c.taskType && c.complexity && c.minModelTier && typeof c.complexityScore === "number") {
      passed += pass("MT-D10", "Task classification works for team routes",
        `taskType=${c.taskType}, complexity=${c.complexity}, model=${c.minModelTier}, score=${c.complexityScore}`);
    } else {
      fail("MT-D10", "Task classification works for team routes",
        `Missing fields: ${JSON.stringify(c)}`);
    }
  } else {
    fail("MT-D10", "Task classification works for team routes",
      t10.success ? "No classification" : t10.error.message);
  }

  // ---------------------------------------------------------------
  // MT-D11: Available teams for STANDARD = 3
  // ---------------------------------------------------------------
  total++;
  reset();
  const r11 = createAgentRouter({ tier: TIER });
  const registry = r11.getTeamRegistry();
  const teams = registry.getAvailableTeams();
  const teamIds = teams.map(t => t.id).sort();
  if (teams.length === 3 && JSON.stringify(teamIds) === JSON.stringify(["dev", "planning", "qa"])) {
    passed += pass("MT-D11", "STANDARD tier has exactly 3 teams",
      `teams=[${teamIds.join(", ")}]`);
  } else {
    fail("MT-D11", "STANDARD tier has exactly 3 teams",
      `got ${teams.length} teams: [${teamIds.join(", ")}]`);
  }

  // ---------------------------------------------------------------
  // MT-D12: Warnings propagated from mention parser
  // ---------------------------------------------------------------
  total++;
  reset();
  const r12 = createAgentRouter({ tier: TIER });
  const t12 = await r12.route('@planning,unknownagent "test warnings"');
  if (t12.success && t12.decision.warnings.length > 0) {
    const hasUnknownWarning = t12.decision.warnings.some(w => w.includes("unknownagent"));
    if (hasUnknownWarning) {
      passed += pass("MT-D12", "Warnings propagated for unknown agents",
        `warnings=${JSON.stringify(t12.decision.warnings)}`);
    } else {
      fail("MT-D12", "Warnings propagated for unknown agents",
        `warnings=${JSON.stringify(t12.decision.warnings)} (missing unknownagent)`);
    }
  } else {
    fail("MT-D12", "Warnings propagated for unknown agents",
      t12.success ? `no warnings: ${JSON.stringify(t12.decision.warnings)}` : t12.error.message);
  }

  // ---------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------
  console.log(`\n${"=".repeat(55)}`);
  console.log(`Dyad Manual Tests: ${passed}/${total} passed (STANDARD tier)`);
  console.log(`${"=".repeat(55)}\n`);

  process.exit(passed === total ? 0 : 1);
}

runDyadTests().catch(console.error);
