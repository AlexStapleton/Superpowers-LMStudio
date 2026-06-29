// Per-case orchestration, extracted from run-eval.js so it is unit-testable (R4).
// runCase runs N samples, judges adherence, scores, aggregates, and excludes infra-errored samples.
const { renderDispatcherCompact, matchTriggers } = require("../dist/skills.js");
const { currentDateLine } = require("../dist/promptPreprocessor.js");
const { scoreCase, aggregateSamples } = require("../dist/evalAnalysis.js");
const { semanticMatch, buildEmbeddingText, QUERY_PREFIX, DOC_PREFIX } = require("../dist/semanticRouter.js");
const { runConversation, makeStubExecutor, embed, USE_WORKFLOW_TOOL, STUB_TOOLS } = require("./client.js");
const { judgeAdherence } = require("./judge.js");

let cachedEvalSkillEmbeddings = null;

const DISPATCH_PREAMBLE =
  "[Workflow routing — inline guidance, NOT a task; do not search files for it.] If the user's " +
  "request matches one of the workflows below, FIRST call the `use_workflow` tool with that name " +
  "and follow what it returns, opening your reply with \"Using <workflow> —\". If nothing clearly " +
  "matches (simple commands, questions, small edits), ignore this and just respond normally.";

// injectWorkflowName: the workflow the (simulated) router pre-injects, or null. Mirrors the real
// plugin, where the code router injects the procedure when the prompt matches a trigger.
function buildSystem(skills, c, injectWorkflowName) {
  // Mirror plugin E1: when a body is auto-loaded, drop the dispatcher table (one-liner only);
  // otherwise show the compact list so the model can self-route via use_workflow.
  // Mirror the plugin's per-turn ambient date injection so research/time cases are realistic.
  const dateLine = currentDateLine(new Date()) + "\n\n";
  const skill = injectWorkflowName ? skills.find(s => s.name === injectWorkflowName) : null;
  if (skill) {
    return dateLine + "[Workflow routing — a matching workflow procedure has been loaded below; follow it. Do NOT search files for it.]"
      + "\n\n[Workflow auto-loaded — follow this procedure now]\n" + skill.body;
  }
  return dateLine + DISPATCH_PREAMBLE + "\n\n" + renderDispatcherCompact(skills);
}

// What the system loads up front, mirroring the real plugin's hybrid router:
//  router-mode forces the case's workflow; otherwise keyword triggers, then semantic fallback (C1).
async function routerLoaded(c, ctx) {
  if (c.mode === "router" && c.workflow) return c.workflow;
  if (!ctx.routerOn) return null;
  const kw = matchTriggers(ctx.skills, c.prompt);
  if (kw) return kw;
  if (!ctx.semanticOn) return null;
  // Semantic fallback via the embeddings endpoint (skips gracefully if no embedding model).
  const key = ctx.skills.map(s => s.name).join(",");
  if (!cachedEvalSkillEmbeddings || cachedEvalSkillEmbeddings.key !== key) {
    const vecs = await embed(ctx.baseUrl, ctx.embedModel, ctx.skills.map(s => DOC_PREFIX + buildEmbeddingText(s)));
    if (!vecs) return null;
    cachedEvalSkillEmbeddings = { key, embeddings: ctx.skills.map((s, i) => ({ name: s.name, vector: vecs[i] })) };
  }
  const q = await embed(ctx.baseUrl, ctx.embedModel, [QUERY_PREFIX + c.prompt]);
  if (!q) return null;
  const hit = semanticMatch(q[0], cachedEvalSkillEmbeddings.embeddings, ctx.semanticThreshold ?? 0.35, ctx.semanticMargin ?? 0.05);
  return hit ? hit.name : null;
}

// ctx: { baseUrl, model, judgeModel, skills, skillByName, samples, guardrailMode, tools }
// Returns { caseReport, results: CaseResult[] (non-errored only), errors }.
async function runCase(c, ctx) {
  const loaded = await routerLoaded(c, { ...ctx, routerOn: ctx.routerOn !== false }); // router pre-injects (or null)
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

module.exports = { buildSystem, runCase, routerLoaded, USE_WORKFLOW_TOOL, STUB_TOOLS };
