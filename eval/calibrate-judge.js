#!/usr/bin/env node
// Judge calibration (R6). Runs the adherence judge against hand-labeled golden trajectories and
// reports agreement — a low score means the judge or its prompt has drifted, not the model.
// Run: npm run judge-calibration  (needs a live endpoint; skips cleanly when down).
const path = require("node:path");
const { loadSkills, getSkillsDirCandidates } = require("../dist/skills.js");
const { calibrationReport } = require("../dist/evalAnalysis.js");
const { probeEndpoint } = require("./client.js");
const { judgeAdherence } = require("./judge.js");
const { GOLDENS } = require("./golden-trajectories.js");

async function runCalibration() {
  const baseUrl = process.env.EVAL_BASE_URL || "http://localhost:1234/v1";
  const model = process.env.EVAL_JUDGE_MODEL || process.env.EVAL_MODEL || (await probeEndpoint(baseUrl));
  if (!model) {
    console.log(`No model reachable at ${baseUrl}. Start the LM Studio server, then re-run.`);
    return null;
  }
  const skills = await loadSkills(getSkillsDirCandidates(path.join(__dirname, ".."), process.cwd()));
  const byName = new Map(skills.map(s => [s.name, s]));
  console.log(`Judge: ${model} @ ${baseUrl}   goldens: ${GOLDENS.length}\n`);

  const results = [];
  for (const g of GOLDENS) {
    const skill = byName.get(g.workflow);
    const v = await judgeAdherence({
      baseUrl, model,
      procedure: skill ? skill.body : g.workflow, prompt: g.prompt, trajectory: g.trajectory,
    });
    const ok = v.pass === g.expected;
    results.push({ id: g.id, expected: g.expected, got: v.pass });
    console.log(`  ${ok ? "✓" : "✗"} ${g.id.padEnd(16)} expected=${g.expected} got=${v.pass}   ${v.reason}`);
  }

  const rep = calibrationReport(results);
  console.log(`\nJudge agreement: ${Math.round(rep.agreement * 100)}% (${rep.correct}/${rep.total})  false+=${rep.falsePositives} false-=${rep.falseNegatives}`);
  if (rep.agreement < 0.8) console.log("⚠️ Judge agreement below 80% — review the judge prompt (B9) before trusting adherence numbers.");
  return rep;
}

module.exports = { runCalibration };

if (require.main === module) {
  runCalibration().catch(e => { console.error(e); process.exit(1); });
}
