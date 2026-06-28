const test = require("node:test");
const assert = require("node:assert/strict");
const {
  checkAnnounce, checkToolInvoked, checkNoWorkflow, checkFirstStep, scoreCase, summarize,
  summarizeRouting,
} = require("../dist/evalAnalysis.js");

test("summarizeRouting computes recall, benign precision, misroutes, false positives (B3)", () => {
  const r = summarizeRouting([
    { id: "a", expected: "tdd", got: "tdd" },          // hit
    { id: "b", expected: "debugging", got: null },      // miss
    { id: "c", expected: "research", got: "tdd" },      // misroute
    { id: "d", expected: null, got: null },             // benign clean
    { id: "e", expected: null, got: "debugging" },      // false positive
  ]);
  assert.equal(r.recallHit, 1);
  assert.equal(r.recallTotal, 3);
  assert.equal(r.benignClean, 1);
  assert.equal(r.benignTotal, 2);
  assert.deepEqual(r.falsePositives.map(o => o.id), ["e"]);
  assert.deepEqual(r.misroutes.map(o => o.id).sort(), ["b", "c"]);
  assert.equal(r.perSkill.tdd.hit, 1);
  assert.equal(r.perSkill.debugging.total, 1);
});

test("checkAnnounce detects the announcement line", () => {
  assert.equal(checkAnnounce("Using Systematic Debugging — let's start", "Systematic Debugging").pass, true);
  assert.equal(checkAnnounce("Sure, here is the answer", "Systematic Debugging").pass, false);
});

test("checkToolInvoked matches the expected workflow", () => {
  const calls = [{ name: "use_workflow", args: { workflow: "debugging" } }];
  assert.equal(checkToolInvoked(calls, "debugging").pass, true);
  assert.equal(checkToolInvoked(calls, "tdd").pass, false);
  assert.equal(checkToolInvoked([], "debugging").pass, false);
});

test("checkNoWorkflow passes only when nothing fired", () => {
  assert.equal(checkNoWorkflow([], "the current directory is /foo").pass, true);
  assert.equal(checkNoWorkflow([{ name: "use_workflow", args: { workflow: "tdd" } }], "ok").pass, false);
  assert.equal(checkNoWorkflow([], "Using Research — searching now").pass, false);
});

test("checkFirstStep: tdd wants a test before implementation", () => {
  assert.equal(checkFirstStep("tdd", "First I'll write a failing test, then implement it").pass, true);
  assert.equal(checkFirstStep("tdd", "Here is the implementation:\n```js\ncode\n```").pass, false);
});

test("checkFirstStep: brainstorming must not dump code, should explore", () => {
  assert.equal(checkFirstStep("brainstorming", "What is the goal here? I see two approaches.").pass, true);
  assert.equal(checkFirstStep("brainstorming", "```js\nconst app = express(); // full impl here, lots of code\n```").pass, false);
});

test("checkFirstStep: debugging wants investigation", () => {
  assert.equal(checkFirstStep("debugging", "Let's find the root cause before changing anything").pass, true);
  assert.equal(checkFirstStep("debugging", "Just change line 5 and it's fixed").pass, false);
});

test("checkFirstStep is soft and defaults to pass for workflows with no heuristic", () => {
  const r = checkFirstStep("research", "anything");
  assert.equal(r.soft, true);
  assert.equal(r.pass, true);
});

test("workflowLoaded passes via router match OR a use_workflow tool call (realistic mode)", () => {
  const c = { id: "x", prompt: "p", mode: "tool", workflow: "debugging", checks: ["workflowLoaded"] };
  // via tool
  const viaTool = scoreCase(c, { finalText: "", toolCalls: [{ name: "use_workflow", args: { workflow: "debugging" } }] }, undefined, {});
  assert.equal(viaTool.checks[0].pass, true);
  // via router (no tool call, but router matched the prompt to this workflow)
  const viaRouter = scoreCase(c, { finalText: "", toolCalls: [] }, undefined, { routerMatched: "debugging" });
  assert.equal(viaRouter.checks[0].pass, true);
  // neither -> the real coverage gap
  const neither = scoreCase(c, { finalText: "", toolCalls: [] }, undefined, { routerMatched: null });
  assert.equal(neither.checks[0].pass, false);
});

test("summarize reports workflowLoadedRate", () => {
  const results = [
    { id: "1", workflow: "debugging", mode: "tool", hardPass: true, checks: [{ name: "workflowLoaded", pass: true }] },
    { id: "2", workflow: "debugging", mode: "tool", hardPass: false, checks: [{ name: "workflowLoaded", pass: false }] },
  ];
  assert.equal(summarize(results).workflowLoadedRate, 0.5);
});

test("scoreCase: soft firstStep does not gate hardPass", () => {
  const c = { id: "x", prompt: "p", mode: "router", workflow: "tdd", announce: "Test-Driven Development", checks: ["announce", "firstStep"] };
  const traj = { finalText: "Using Test-Driven Development — here is the implementation ```js x ```", toolCalls: [] };
  const r = scoreCase(c, traj);
  assert.equal(r.hardPass, true); // announce passed; firstStep failed but is soft
  assert.equal(r.checks.find(k => k.name === "firstStep").pass, false);
});

const { formatTrajectory, buildJudgePrompt, parseJudgeVerdict, aggregateSamples } = require("../dist/evalAnalysis.js");

test("formatTrajectory lists assistant text and tool calls in order, flagging blocked calls", () => {
  const traj = { finalText: "hello there", toolCalls: [{ name: "use_workflow", args: { workflow: "tdd" } }, { name: "save_file", args: { file_name: "a.py" } }] };
  const s = formatTrajectory(traj);
  assert.match(s, /hello there/);
  assert.ok(s.indexOf("use_workflow") < s.indexOf("save_file"));
  // blocked calls are annotated so the judge doesn't count them
  assert.match(formatTrajectory({ finalText: "", toolCalls: [{ name: "save_file", args: {}, status: "BLOCKED" }] }), /BLOCKED — did NOT execute/);
});

test("buildJudgePrompt includes procedure, prompt, and asks for a JSON follows verdict", () => {
  const p = buildJudgePrompt("PROCEDURE_BODY", "USER_PROMPT", { finalText: "x", toolCalls: [] });
  assert.match(p, /PROCEDURE_BODY/);
  assert.match(p, /USER_PROMPT/);
  assert.match(p, /follows/i);
  assert.match(p, /json/i);
  // B9: must tell the judge to ignore the announcement and grade substance.
  assert.match(p, /announc/i);
  assert.match(p, /do not penalize|ignore/i);
});

test("parseJudgeVerdict parses clean JSON, fenced JSON, and rejects garbage", () => {
  assert.equal(parseJudgeVerdict('{"follows": true, "reason": "wrote a test first"}').pass, true);
  const fenced = parseJudgeVerdict('Sure!\n```json\n{"follows": false, "reason": "jumped to a fix"}\n```');
  assert.equal(fenced.pass, false);
  assert.match(fenced.reason, /fix/);
  assert.equal(parseJudgeVerdict("no json here").pass, false);
  // unparseable is a JUDGE error (excluded from adherence), not a genuine "did not follow"
  assert.equal(parseJudgeVerdict("no json here").error, true);
  assert.equal(parseJudgeVerdict('{"follows": true, "reason": "ok"}').error, undefined);
});

const { majorityVerdict, checkRegressions, calibrationReport } = require("../dist/evalAnalysis.js");

test("calibrationReport scores judge agreement and counts FP/FN", () => {
  const r = calibrationReport([
    { expected: true, got: true },    // correct
    { expected: false, got: false },  // correct
    { expected: false, got: true },   // false positive
    { expected: true, got: false },   // false negative
  ]);
  assert.equal(r.total, 4);
  assert.equal(r.correct, 2);
  assert.equal(r.agreement, 0.5);
  assert.equal(r.falsePositives, 1);
  assert.equal(r.falseNegatives, 1);
});

test("checkRegressions flags metrics that dropped beyond the margin", () => {
  const baseline = { announceRate: 0.6, toolInvocationRate: 1.0, adherenceRate: 0.9, total: 10, hardPass: 8 };
  const current = { announceRate: 0.6, toolInvocationRate: 0.7, adherenceRate: 0.9, total: 10, hardPass: 8 };
  const regs = checkRegressions(baseline, current, 0.1);
  assert.equal(regs.length, 1);
  assert.equal(regs[0].metric, "toolInvocationRate"); // dropped 1.0 -> 0.7 (> 0.1 margin)

  // within margin -> no regression
  assert.equal(checkRegressions(baseline, { ...current, toolInvocationRate: 0.95 }, 0.1).length, 0);
  // improvement -> never a regression
  assert.equal(checkRegressions(baseline, { ...baseline, adherenceRate: 1.0 }, 0.1).length, 0);
});

test("majorityVerdict takes the strict majority and fails closed on ties", () => {
  assert.equal(majorityVerdict([{ pass: true }, { pass: true }, { pass: false }]).pass, true);
  assert.equal(majorityVerdict([{ pass: false }, { pass: false }, { pass: true }]).pass, false);
  assert.equal(majorityVerdict([{ pass: true }, { pass: false }]).pass, false); // tie -> fail
  assert.equal(majorityVerdict([]).pass, false);
  assert.match(majorityVerdict([{ pass: true, reason: "good" }]).reason, /good/);
  // errored verdicts don't vote; majority of the usable ones wins
  assert.equal(majorityVerdict([{ pass: true }, { pass: false, error: true }, { pass: false, error: true }]).pass, true);
  // all errored -> the whole judgment is an error (excluded), not a fail
  assert.equal(majorityVerdict([{ pass: false, error: true }, { pass: false, error: true }]).error, true);
});

test("aggregateSamples computes per-check and hardPass rates", () => {
  const mk = (hp, adh) => ({ id: "x", workflow: "tdd", mode: "router", hardPass: hp,
    checks: [{ name: "announce", pass: hp }, { name: "adherence", pass: adh, soft: true }] });
  const agg = aggregateSamples([mk(true, true), mk(true, false), mk(false, false)]);
  assert.equal(agg.hardPassRate, 2 / 3);
  assert.equal(agg.checkRates.announce, 2 / 3);
  assert.equal(agg.checkRates.adherence, 1 / 3);
});

test("scoreCase uses an injected adherence verdict (soft, non-gating)", () => {
  const c = { id: "x", prompt: "p", mode: "router", workflow: "tdd", announce: "Test-Driven Development", checks: ["announce", "adherence"] };
  const traj = { finalText: "Using Test-Driven Development — done", toolCalls: [] };
  const r = scoreCase(c, traj, { pass: false, reason: "no test" });
  const adh = r.checks.find(k => k.name === "adherence");
  assert.equal(adh.pass, false);
  assert.equal(adh.soft, true);
  assert.match(adh.detail, /no test/);
  assert.equal(r.hardPass, true);
});

test("summarize computes rates and per-workflow", () => {
  const results = [
    { id: "1", workflow: "debugging", mode: "tool", hardPass: true,
      checks: [{ name: "announce", pass: true }, { name: "toolInvoked", pass: true }] },
    { id: "2", workflow: "debugging", mode: "tool", hardPass: false,
      checks: [{ name: "announce", pass: false }, { name: "toolInvoked", pass: false }] },
    { id: "3", workflow: null, mode: "tool", hardPass: true,
      checks: [{ name: "noWorkflow", pass: true }] },
  ];
  const s = summarize(results);
  assert.equal(s.total, 3);
  assert.equal(s.hardPass, 2);
  assert.equal(s.announceRate, 0.5);          // 1 of 2 announce checks
  assert.equal(s.toolInvocationRate, 0.5);    // 1 of 2 tool-mode toolInvoked checks
  assert.deepEqual(s.byWorkflow.debugging, { total: 2, hardPass: 1 });
});
