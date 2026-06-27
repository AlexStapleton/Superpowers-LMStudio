// Per-case orchestration, extracted from run-eval.js so it is unit-testable (R4).
// runCase runs N samples, judges adherence, scores, aggregates, and excludes infra-errored samples.
const { renderDispatcherTable, matchTriggers } = require("../dist/skills.js");
const { scoreCase, aggregateSamples } = require("../dist/evalAnalysis.js");
const { runConversation, makeStubExecutor, USE_WORKFLOW_TOOL, STUB_TOOLS } = require("./client.js");
const { judgeAdherence } = require("./judge.js");

const DISPATCH_PREAMBLE =
  "[Workflow routing — inline guidance, NOT a task; do not search files for it.] If the user's " +
  "request matches one of the workflows below, FIRST call the `use_workflow` tool with that name " +
  "and follow what it returns, opening your reply with \"Using <workflow> —\". If nothing clearly " +
  "matches (simple commands, questions, small edits), ignore this and just respond normally.";

// injectWorkflowName: the workflow the (simulated) router pre-injects, or null. Mirrors the real
// plugin, where the code router injects the procedure when the prompt matches a trigger.
function buildSystem(skills, c, injectWorkflowName) {
  let sys = DISPATCH_PREAMBLE + "\n\n" + renderDispatcherTable(skills);
  if (injectWorkflowName) {
    const skill = skills.find(s => s.name === injectWorkflowName);
    if (skill) sys += "\n\n[Workflow auto-loaded — follow this procedure now]\n" + skill.body;
  }
  return sys;
}

// What the system loads up front: router-mode forces the case's workflow; otherwise (realistic) the
// code router injects whatever the regex triggers match on the prompt (often nothing — the real gap).
function routerLoaded(skills, c, routerOn) {
  if (c.mode === "router" && c.workflow) return c.workflow;
  if (routerOn) return matchTriggers(skills, c.prompt);
  return null;
}

// ctx: { baseUrl, model, judgeModel, skills, skillByName, samples, guardrailMode, tools }
// Returns { caseReport, results: CaseResult[] (non-errored only), errors }.
async function runCase(c, ctx) {
  const routerOn = ctx.routerOn !== false;
  const loaded = routerLoaded(ctx.skills, c, routerOn); // workflow the router pre-injects (or null)
  const messages = [
    { role: "system", content: buildSystem(ctx.skills, c, loaded) },
    { role: "user", content: c.prompt },
  ];
  const usesJudge = c.checks.includes("adherence") && c.workflow && ctx.skillByName.has(c.workflow);
  const samples = [];
  const results = [];
  let errors = 0;

  for (let i = 0; i < ctx.samples; i++) {
    const executeTool = makeStubExecutor(ctx.skills, {
      guardrailMode: ctx.guardrailMode,
      ambientWorkflow: c.mode === "router" ? c.workflow : null,
    });
    let traj;
    try {
      traj = await runConversation({ baseUrl: ctx.baseUrl, model: ctx.model, messages, tools: ctx.tools, executeTool, maxTurns: ctx.maxTurns });
    } catch (e) {
      errors++;
      samples.push({ errored: true, error: e.message });
      continue;
    }
    let verdict;
    if (usesJudge) {
      verdict = await judgeAdherence({
        baseUrl: ctx.baseUrl, model: ctx.judgeModel,
        procedure: ctx.skillByName.get(c.workflow).body, prompt: c.prompt, trajectory: traj,
      });
    }
    const r = scoreCase(c, traj, verdict, { routerMatched: loaded });
    results.push(r);
    samples.push({ result: r, finalText: traj.finalText, toolCalls: traj.toolCalls, verdict });
  }

  const valid = samples.filter(s => s.result).map(s => s.result);
  const agg = aggregateSamples(valid);
  return { caseReport: { id: c.id, mode: c.mode, workflow: c.workflow, agg, samples }, results, errors };
}

module.exports = { buildSystem, runCase, USE_WORKFLOW_TOOL, STUB_TOOLS };
