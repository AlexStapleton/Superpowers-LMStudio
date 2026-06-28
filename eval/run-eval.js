#!/usr/bin/env node
// Behavioral eval runner (backlog B1/B2). Drives a local model (LM Studio OpenAI endpoint) through
// held-out cases using the REAL skills.ts context, scores announce / tool-invocation / adherence.
// Offline + opt-in (`npm run eval`); skips cleanly when the endpoint is down. Per-case orchestration
// lives in runner.js (testable). Env: EVAL_BASE_URL, EVAL_MODEL, EVAL_MODE, EVAL_CASE, EVAL_SAMPLES,
// EVAL_GUARDRAIL, EVAL_JUDGE_MODEL, EVAL_JUDGE_VOTES.

const fs = require("node:fs");
const path = require("node:path");
const { loadSkills, getSkillsDirCandidates } = require("../dist/skills.js");
const { summarize } = require("../dist/evalAnalysis.js");
const { probeEndpoint, diagnoseEndpoint, probeEmbeddings } = require("./client.js");
const { runCase, USE_WORKFLOW_TOOL, STUB_TOOLS } = require("./runner.js");
const { CASES } = require("./cases.js");

const BASE_URL = process.env.EVAL_BASE_URL || "http://localhost:1234/v1";
const MODE_FILTER = process.env.EVAL_MODE || null;
const CASE_FILTER = process.env.EVAL_CASE || null;
const SAMPLES = Math.max(1, parseInt(process.env.EVAL_SAMPLES || "3", 10));
const GUARDRAIL_MODE = process.env.EVAL_GUARDRAIL || "block"; // off | warn | block
const MAX_TURNS = Math.max(1, parseInt(process.env.EVAL_MAX_TURNS || "8", 10)); // realistic exploration needs room
const ROUTER_ON = (process.env.EVAL_ROUTER || "on") !== "off"; // model the real plugin's code router
const SEMANTIC_ON = (process.env.EVAL_SEMANTIC || "on") !== "off"; // C1 semantic fallback
const EMBED_MODEL = process.env.EVAL_EMBED_MODEL || "nomic-ai/nomic-embed-text-v1.5-GGUF";
const SEMANTIC_THRESHOLD = parseFloat(process.env.EVAL_SEMANTIC_THRESHOLD || "0.35");
const SEMANTIC_MARGIN = parseFloat(process.env.EVAL_SEMANTIC_MARGIN || "0.05");

async function main() {
  const model = process.env.EVAL_MODEL || (await probeEndpoint(BASE_URL));
  if (!model) {
    const reason = await diagnoseEndpoint(BASE_URL);
    if (reason === "auth") {
      console.log(`The server at ${BASE_URL} is up but requires an API token (HTTP 401/403).`);
      console.log("Set the LM Studio token, then re-run:  $env:EVAL_API_KEY = \"<your-token>\"  (PowerShell)");
      console.log("Find/generate it in LM Studio → Developer tab → server settings, or disable 'Require API token'.");
    } else if (reason === "no-model") {
      console.log(`The server at ${BASE_URL} is reachable and authorized, but no model is loaded.`);
      console.log("Load a chat model in LM Studio (Developer tab), then re-run `npm run eval`.");
    } else {
      console.log(`No server reachable at ${BASE_URL}.`);
      console.log("Start the LM Studio local server (Developer tab → Start Server) with a model loaded,");
      console.log("then re-run `npm run eval`. Override the URL/model with EVAL_BASE_URL / EVAL_MODEL.");
    }
    return; // let the process drain naturally (process.exit mid-fetch trips a libuv assert on Windows)
  }
  console.log(`Model: ${model} @ ${BASE_URL}\n`);

  const pluginRoot = path.join(__dirname, "..");
  const skills = await loadSkills(getSkillsDirCandidates(pluginRoot, process.cwd()));
  if (skills.length === 0) {
    console.error("No skills loaded — run from the project root after `npm run build`.");
    process.exit(1);
  }

  let cases = CASES;
  if (MODE_FILTER) cases = cases.filter(c => c.mode === MODE_FILTER);
  if (CASE_FILTER) cases = cases.filter(c => c.id.includes(CASE_FILTER));

  const JUDGE_MODEL = process.env.EVAL_JUDGE_MODEL || model;
  const skillByName = new Map(skills.map(s => [s.name, s]));

  // R3: fail loudly on bad case config so a typo can't silently skip coverage.
  const KNOWN_CHECKS = new Set(["announce", "toolInvoked", "workflowLoaded", "noWorkflow", "firstStep", "adherence"]);
  let configIssues = 0;
  for (const c of CASES) {
    if (c.workflow && !skillByName.has(c.workflow)) { console.log(`  [config] case ${c.id}: unknown workflow '${c.workflow}'`); configIssues++; }
    for (const k of c.checks) if (!KNOWN_CHECKS.has(k)) { console.log(`  [config] case ${c.id}: unknown check '${k}'`); configIssues++; }
  }
  if (configIssues) console.log(`  [config] ${configIssues} case-config issue(s) — coverage may be silently skipped.`);

  console.log(`Samples/case: ${SAMPLES}   Judge: ${JUDGE_MODEL} x${process.env.EVAL_JUDGE_VOTES || 1}   TDD guardrail: ${GUARDRAIL_MODE}\n`);

  console.log(`Router (code-side): ${ROUTER_ON ? "on (realistic)" : "off"}   Semantic fallback: ${SEMANTIC_ON ? `on (${EMBED_MODEL} @ thr ${SEMANTIC_THRESHOLD}, margin ${SEMANTIC_MARGIN})` : "off"}`);
  if (SEMANTIC_ON) {
    const probe = await probeEmbeddings(BASE_URL, EMBED_MODEL);
    console.log(probe.ok
      ? `  embeddings OK (dim ${probe.dim})`
      : `  ⚠️ embeddings UNAVAILABLE — semantic fallback will be SKIPPED. Reason: ${probe.error}\n     Fix: set EVAL_EMBED_MODEL to an id from /v1/models, and ensure an embedding model is loaded.`);
  }
  console.log("");
  const ctx = {
    baseUrl: BASE_URL, model, judgeModel: JUDGE_MODEL, skills, skillByName,
    samples: SAMPLES, guardrailMode: GUARDRAIL_MODE, maxTurns: MAX_TURNS, routerOn: ROUTER_ON,
    semanticOn: SEMANTIC_ON, embedModel: EMBED_MODEL, semanticThreshold: SEMANTIC_THRESHOLD, semanticMargin: SEMANTIC_MARGIN,
    tools: [USE_WORKFLOW_TOOL, ...STUB_TOOLS],
  };

  const flatResults = [];
  const caseReports = [];
  let errorCount = 0;

  for (const c of cases) {
    const { caseReport, results, errors } = await runCase(c, ctx);
    flatResults.push(...results);
    caseReports.push(caseReport);
    errorCount += errors;
    const n = results.length;
    const agg = caseReport.agg;
    const detail = c.checks.map(name => `${name}:${Math.round((agg.checkRates[name] ?? 0) * n)}/${n}`).join("  ");
    const errNote = errors ? `  (${errors} errored)` : "";
    console.log(`  ${c.id.padEnd(18)} (${c.mode}/${c.workflow ?? "benign"})  hardPass ${Math.round(agg.hardPassRate * n)}/${n}${errNote}   ${detail}`);
  }

  const s = summarize(flatResults);
  const adh = flatResults.flatMap(r => r.checks.filter(k => k.name === "adherence"));
  const adhValid = adh.filter(k => !k.errored);
  const adherenceRate = adhValid.length ? adhValid.filter(k => k.pass).length / adhValid.length : 0;
  const judgeErrors = adh.length - adhValid.length;
  const pct = x => `${Math.round(x * 100)}%`;
  console.log(`\n=== Summary (averaged over ${SAMPLES} samples/case) ===`);
  console.log(`Hard-pass (avg):       ${s.total ? pct(s.hardPass / s.total) : "n/a"}`);
  console.log(`Workflow-loaded rate:  ${pct(s.workflowLoadedRate)}  (router OR tool — the realistic plugin)`);
  console.log(`  ↳ self-invoked tool: ${pct(s.toolInvocationRate)}  (model called use_workflow itself)`);
  console.log(`Announce rate:         ${pct(s.announceRate)}`);
  console.log(`Adherence (judge):     ${pct(adherenceRate)}  (router cases${judgeErrors ? `; ${judgeErrors} judge-error(s) excluded` : ""})`);
  console.log("By workflow:", JSON.stringify(s.byWorkflow));
  if (errorCount) console.log(`Excluded (infra errors, not behavioral failures): ${errorCount} sample(s)`);

  const summaryOut = { ...s, adherenceRate, errorCount };
  const reportPath = path.join(__dirname, "report.json");
  fs.writeFileSync(reportPath, JSON.stringify(
    { model, judgeModel: JUDGE_MODEL, baseUrl: BASE_URL, samples: SAMPLES, summary: summaryOut, cases: caseReports },
    null, 2));
  console.log(`\nFull report: ${reportPath}`);

  // R5: regression gate — compare to a saved baseline when present.
  const { checkRegressions, formatRegressions, loadBaseline, saveBaseline } = require("./baseline.js");
  if (process.env.EVAL_SAVE_BASELINE) {
    saveBaseline(path.join(__dirname, "baseline.json"), summaryOut);
    console.log("Saved current summary as the regression baseline.");
  } else {
    const baseline = loadBaseline(path.join(__dirname, "baseline.json"));
    if (baseline) {
      const regressions = checkRegressions(baseline, summaryOut, Number(process.env.EVAL_REGRESSION_MARGIN || 0.1));
      console.log("\n" + formatRegressions(regressions, baseline, summaryOut));
      if (regressions.length) process.exitCode = 2;
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
