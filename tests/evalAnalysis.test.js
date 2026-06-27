const test = require("node:test");
const assert = require("node:assert/strict");
const {
  checkAnnounce, checkToolInvoked, checkNoWorkflow, checkFirstStep, scoreCase, summarize,
} = require("../dist/evalAnalysis.js");

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

test("scoreCase: soft firstStep does not gate hardPass", () => {
  const c = { id: "x", prompt: "p", mode: "router", workflow: "tdd", announce: "Test-Driven Development", checks: ["announce", "firstStep"] };
  const traj = { finalText: "Using Test-Driven Development — here is the implementation ```js x ```", toolCalls: [] };
  const r = scoreCase(c, traj);
  assert.equal(r.hardPass, true); // announce passed; firstStep failed but is soft
  assert.equal(r.checks.find(k => k.name === "firstStep").pass, false);
});

const { formatTrajectory, buildJudgePrompt, parseJudgeVerdict, aggregateSamples } = require("../dist/evalAnalysis.js");

test("formatTrajectory lists assistant text and tool calls in order", () => {
  const traj = { finalText: "hello there", toolCalls: [{ name: "use_workflow", args: { workflow: "tdd" } }, { name: "save_file", args: { file_name: "a.py" } }] };
  const s = formatTrajectory(traj);
  assert.match(s, /hello there/);
  assert.ok(s.indexOf("use_workflow") < s.indexOf("save_file"));
});

test("buildJudgePrompt includes procedure, prompt, and asks for a JSON follows verdict", () => {
  const p = buildJudgePrompt("PROCEDURE_BODY", "USER_PROMPT", { finalText: "x", toolCalls: [] });
  assert.match(p, /PROCEDURE_BODY/);
  assert.match(p, /USER_PROMPT/);
  assert.match(p, /follows/i);
  assert.match(p, /json/i);
});

test("parseJudgeVerdict parses clean JSON, fenced JSON, and rejects garbage", () => {
  assert.equal(parseJudgeVerdict('{"follows": true, "reason": "wrote a test first"}').pass, true);
  const fenced = parseJudgeVerdict('Sure!\n```json\n{"follows": false, "reason": "jumped to a fix"}\n```');
  assert.equal(fenced.pass, false);
  assert.match(fenced.reason, /fix/);
  assert.equal(parseJudgeVerdict("no json here").pass, false);
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
