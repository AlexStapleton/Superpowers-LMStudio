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
const { scoreCase, summarize } = require("../dist/evalAnalysis.js");
const { probeEndpoint, runConversation, makeStubExecutor, USE_WORKFLOW_TOOL, STUB_TOOLS } = require("./client.js");
const { CASES } = require("./cases.js");

const BASE_URL = process.env.EVAL_BASE_URL || "http://localhost:1234/v1";
const MODE_FILTER = process.env.EVAL_MODE || null;
const CASE_FILTER = process.env.EVAL_CASE || null;

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
  const executeTool = makeStubExecutor(skills);
  const tools = [USE_WORKFLOW_TOOL, ...STUB_TOOLS];

  let cases = CASES;
  if (MODE_FILTER) cases = cases.filter(c => c.mode === MODE_FILTER);
  if (CASE_FILTER) cases = cases.filter(c => c.id.includes(CASE_FILTER));

  const results = [];
  for (const c of cases) {
    const messages = [
      { role: "system", content: buildSystem(skills, c) },
      { role: "user", content: c.prompt },
    ];
    let traj;
    try {
      traj = await runConversation({ baseUrl: BASE_URL, model, messages, tools, executeTool });
    } catch (e) {
      console.log(`  [${c.id}] ERROR: ${e.message}`);
      traj = { finalText: "", toolCalls: [] };
    }
    const r = scoreCase(c, traj);
    results.push(r);
    const mark = r.hardPass ? "PASS" : "FAIL";
    const detail = r.checks.map(k => `${k.name}${k.soft ? "*" : ""}:${k.pass ? "y" : "n"}`).join(" ");
    console.log(`  [${mark}] ${c.id.padEnd(18)} (${c.mode}/${c.workflow ?? "benign"})  ${detail}`);
  }

  const s = summarize(results);
  const pct = n => `${Math.round(n * 100)}%`;
  console.log("\n=== Summary ===");
  console.log(`Cases: ${s.total}   Hard-pass: ${s.hardPass}/${s.total} (${pct(s.hardPass / s.total)})`);
  console.log(`Announce rate:          ${pct(s.announceRate)}`);
  console.log(`Tool-invocation rate:   ${pct(s.toolInvocationRate)}  (tool-mode cases)`);
  console.log(`First-step (soft) rate: ${pct(s.firstStepRate)}`);
  console.log("By workflow:", JSON.stringify(s.byWorkflow));

  const reportPath = path.join(__dirname, "report.json");
  fs.writeFileSync(reportPath, JSON.stringify({ model, baseUrl: BASE_URL, summary: s, results }, null, 2));
  console.log(`\nFull report: ${reportPath}`);
}

main().catch(e => { console.error(e); process.exit(1); });
