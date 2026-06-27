#!/usr/bin/env node
// Behavioral eval runner (backlog B1/B2).
// Drives a local model (LM Studio OpenAI endpoint) through held-out cases using the REAL
// skills.ts context construction, records each trajectory, and scores announce / tool-invocation /
// first-step adherence. Offline + opt-in (`npm run eval`); skips cleanly when the endpoint is down.
//
// Env: EVAL_BASE_URL (default http://localhost:1234/v1), EVAL_MODEL, EVAL_MODE (tool|router),
//      EVAL_CASE (id substring filter).

const fs = require("node:fs");
const path = require("node:path");
const { loadSkills, getSkillsDirCandidates, renderDispatcherTable } = require("../dist/skills.js");
const { scoreCase, summarize, aggregateSamples } = require("../dist/evalAnalysis.js");
const { probeEndpoint, runConversation, makeStubExecutor, USE_WORKFLOW_TOOL, STUB_TOOLS } = require("./client.js");
const { judgeAdherence } = require("./judge.js");
const { CASES } = require("./cases.js");

const BASE_URL = process.env.EVAL_BASE_URL || "http://localhost:1234/v1";
const MODE_FILTER = process.env.EVAL_MODE || null;
const CASE_FILTER = process.env.EVAL_CASE || null;
const SAMPLES = Math.max(1, parseInt(process.env.EVAL_SAMPLES || "3", 10));
const GUARDRAIL_MODE = process.env.EVAL_GUARDRAIL || "block"; // off | warn | block — D1 experiment default

const DISPATCH_PREAMBLE =
  "[Workflow routing — inline guidance, NOT a task; do not search files for it.] If the user's " +
  "request matches one of the workflows below, FIRST call the `use_workflow` tool with that name " +
  "and follow what it returns, opening your reply with \"Using <workflow> —\". If nothing clearly " +
  "matches (simple commands, questions, small edits), ignore this and just respond normally.";

function buildSystem(skills, c) {
  let sys = DISPATCH_PREAMBLE + "\n\n" + renderDispatcherTable(skills);
  if (c.mode === "router" && c.workflow) {
    const skill = skills.find(s => s.name === c.workflow);
    if (skill) sys += "\n\n[Workflow auto-loaded — follow this procedure now]\n" + skill.body;
  }
  return sys;
}

async function main() {
  const model = process.env.EVAL_MODEL || (await probeEndpoint(BASE_URL));
  if (!model) {
    console.log(`No model reachable at ${BASE_URL}.`);
    console.log("Start the LM Studio local server (Developer tab → Start Server) with a model loaded,");
    console.log("then re-run `npm run eval`. Override the URL/model with EVAL_BASE_URL / EVAL_MODEL.");
    process.exit(0);
  }
  console.log(`Model: ${model} @ ${BASE_URL}\n`);

  const pluginRoot = path.join(__dirname, "..");
  const skills = await loadSkills(getSkillsDirCandidates(pluginRoot, process.cwd()));
  if (skills.length === 0) {
    console.error("No skills loaded — run from the project root after `npm run build`.");
    process.exit(1);
  }
  const tools = [USE_WORKFLOW_TOOL, ...STUB_TOOLS];

  let cases = CASES;
  if (MODE_FILTER) cases = cases.filter(c => c.mode === MODE_FILTER);
  if (CASE_FILTER) cases = cases.filter(c => c.id.includes(CASE_FILTER));

  const JUDGE_MODEL = process.env.EVAL_JUDGE_MODEL || model;
  const skillByName = new Map(skills.map(s => [s.name, s]));

  // R3: fail loudly on bad case config so a typo can't silently skip coverage.
  const KNOWN_CHECKS = new Set(["announce", "toolInvoked", "noWorkflow", "firstStep", "adherence"]);
  let configIssues = 0;
  for (const c of CASES) {
    if (c.workflow && !skillByName.has(c.workflow)) { console.log(`  [config] case ${c.id}: unknown workflow '${c.workflow}'`); configIssues++; }
    for (const k of c.checks) if (!KNOWN_CHECKS.has(k)) { console.log(`  [config] case ${c.id}: unknown check '${k}'`); configIssues++; }
  }
  if (configIssues) console.log(`  [config] ${configIssues} case-config issue(s) — coverage may be silently skipped.`);

  console.log(`Samples/case: ${SAMPLES}   Judge: ${JUDGE_MODEL} x${process.env.EVAL_JUDGE_VOTES || 1}   TDD guardrail: ${GUARDRAIL_MODE}\n`);

  const flatResults = [];   // every NON-errored sample's CaseResult — feeds the overall summary
  const caseReports = [];   // per-case: samples (trajectory + verdict) + aggregate
  let errorCount = 0;       // infra errors, excluded from metrics

  for (const c of cases) {
    const messages = [
      { role: "system", content: buildSystem(skills, c) },
      { role: "user", content: c.prompt },
    ];
    const usesJudge = c.checks.includes("adherence") && c.workflow && skillByName.has(c.workflow);
    const samples = [];
    for (let i = 0; i < SAMPLES; i++) {
      // Fresh stateful executor per sample so guardrail state (active workflow, testSeen) resets.
      const executeTool = makeStubExecutor(skills, {
        guardrailMode: GUARDRAIL_MODE,
        ambientWorkflow: c.mode === "router" ? c.workflow : null,
      });
      let traj;
      try {
        traj = await runConversation({ baseUrl: BASE_URL, model, messages, tools, executeTool });
      } catch (e) {
        // Infra error (network/model) is NOT a behavioral failure — exclude it from the metrics
        // so a flaky endpoint can't corrupt the numbers.
        errorCount++;
        console.log(`    [${c.id} #${i + 1}] sample EXCLUDED (infra error): ${e.message}`);
        samples.push({ errored: true, error: e.message });
        continue;
      }
      let verdict;
      if (usesJudge) {
        verdict = await judgeAdherence({
          baseUrl: BASE_URL, model: JUDGE_MODEL,
          procedure: skillByName.get(c.workflow).body, prompt: c.prompt, trajectory: traj,
        });
      }
      const r = scoreCase(c, traj, verdict);
      flatResults.push(r);
      samples.push({ result: r, finalText: traj.finalText, toolCalls: traj.toolCalls, verdict });
    }
    const valid = samples.filter(s => s.result).map(s => s.result);
    const n = valid.length;
    const agg = aggregateSamples(valid);
    caseReports.push({ id: c.id, mode: c.mode, workflow: c.workflow, agg, samples });
    const detail = c.checks.map(name => `${name}:${Math.round((agg.checkRates[name] ?? 0) * n)}/${n}`).join("  ");
    const errNote = n < SAMPLES ? `  (${SAMPLES - n} errored)` : "";
    console.log(`  ${c.id.padEnd(18)} (${c.mode}/${c.workflow ?? "benign"})  hardPass ${Math.round(agg.hardPassRate * n)}/${n}${errNote}   ${detail}`);
  }

  const s = summarize(flatResults);
  const adh = flatResults.flatMap(r => r.checks.filter(k => k.name === "adherence"));
  const adherenceRate = adh.length ? adh.filter(k => k.pass).length / adh.length : 0;
  const pct = n => `${Math.round(n * 100)}%`;
  console.log(`\n=== Summary (averaged over ${SAMPLES} samples/case) ===`);
  console.log(`Hard-pass (avg):      ${pct(s.hardPass / s.total)}`);
  console.log(`Announce rate:        ${pct(s.announceRate)}`);
  console.log(`Tool-invocation rate: ${pct(s.toolInvocationRate)}  (tool-mode)`);
  console.log(`Adherence (judge):    ${pct(adherenceRate)}  (router cases)`);
  console.log("By workflow:", JSON.stringify(s.byWorkflow));
  if (errorCount) console.log(`Excluded (infra errors, not behavioral failures): ${errorCount} sample(s)`);

  const reportPath = path.join(__dirname, "report.json");
  fs.writeFileSync(reportPath, JSON.stringify(
    { model, judgeModel: JUDGE_MODEL, baseUrl: BASE_URL, samples: SAMPLES, summary: { ...s, adherenceRate, errorCount }, cases: caseReports },
    null, 2));
  console.log(`\nFull report: ${reportPath}`);
}

main().catch(e => { console.error(e); process.exit(1); });
