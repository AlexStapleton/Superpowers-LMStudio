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
