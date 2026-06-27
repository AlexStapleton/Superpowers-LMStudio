// Robustness R1: exercise the eval harness orchestration with a fake model (no live endpoint).
const test = require("node:test");
const assert = require("node:assert/strict");
const { runConversation, makeStubExecutor } = require("../eval/client.js");
const { judgeAdherence } = require("../eval/judge.js");
const { runCase } = require("../eval/runner.js");

const SKILLS = [{ name: "tdd", announce: "Test-Driven Development", body: "TDD body", triggers: [], examples: [], description: "d" }];

// Returns a fake fetch that yields scripted JSON bodies (last one repeats).
function mockFetch(bodies) {
  let i = 0;
  return async () => {
    const body = bodies[Math.min(i, bodies.length - 1)];
    i++;
    return { ok: true, json: async () => body };
  };
}
const assistantToolCall = (name, args) => ({ choices: [{ message: { role: "assistant", tool_calls: [{ id: "c" + Math.random(), function: { name, arguments: args } }] } }] });
const assistantText = (content) => ({ choices: [{ message: { role: "assistant", content } }] });

// --- stub executor + D1 guardrail state machine (no fetch) ---

test("stub executor: TDD guardrail blocks source-before-test, then allows after a test", async () => {
  const exec = makeStubExecutor(SKILLS, { guardrailMode: "block" });
  await exec("use_workflow", { workflow: "tdd" });
  const blocked = JSON.parse(await exec("save_file", { file_name: "byte_converter.py", content: "x" }));
  assert.equal(blocked.blocked, true);
  await exec("save_file", { file_name: "test_byte.py", content: "t" }); // writing a test clears it
  const ok = JSON.parse(await exec("save_file", { file_name: "byte_converter.py", content: "x" }));
  assert.equal(ok.ok, true);
});

test("stub executor: run_test_command clears the guardrail; off mode never blocks", async () => {
  const exec = makeStubExecutor(SKILLS, { guardrailMode: "block" });
  await exec("use_workflow", { workflow: "tdd" });
  await exec("run_test_command", { command: "pytest" });
  assert.equal(JSON.parse(await exec("save_file", { file_name: "app.py", content: "x" })).ok, true);

  const off = makeStubExecutor(SKILLS, { guardrailMode: "off" });
  await off("use_workflow", { workflow: "tdd" });
  assert.equal(JSON.parse(await off("save_file", { file_name: "app.py", content: "x" })).ok, true);
});

// --- runConversation tool loop ---

test("runConversation captures tool calls (in order) then final text", async () => {
  const orig = global.fetch;
  global.fetch = mockFetch([assistantToolCall("use_workflow", '{"workflow":"tdd"}'), assistantText("Using TDD — done")]);
  try {
    const exec = async () => JSON.stringify({ ok: true });
    const r = await runConversation({ baseUrl: "http://x/v1", model: "m", messages: [{ role: "user", content: "hi" }], tools: [], executeTool: exec });
    assert.equal(r.toolCalls.length, 1);
    assert.equal(r.toolCalls[0].name, "use_workflow");
    assert.equal(r.toolCalls[0].args.workflow, "tdd");
    assert.match(r.finalText, /Using TDD/);
  } finally { global.fetch = orig; }
});

test("runConversation tolerates malformed tool-call arguments", async () => {
  const orig = global.fetch;
  global.fetch = mockFetch([assistantToolCall("save_file", "{bad json"), assistantText("ok")]);
  try {
    const r = await runConversation({ baseUrl: "http://x/v1", model: "m", messages: [], tools: [], executeTool: async () => "{}" });
    assert.deepEqual(r.toolCalls[0].args, {});
  } finally { global.fetch = orig; }
});

test("runConversation respects maxTurns (no infinite loop on perpetual tool calls)", async () => {
  const orig = global.fetch;
  global.fetch = mockFetch([assistantToolCall("x", "{}")]); // always a tool call
  try {
    const r = await runConversation({ baseUrl: "http://x/v1", model: "m", messages: [], tools: [], executeTool: async () => "{}", maxTurns: 2 });
    assert.equal(r.toolCalls.length, 2);
  } finally { global.fetch = orig; }
});

// --- judge wiring ---

test("judgeAdherence parses a fenced JSON verdict from a mock model", async () => {
  const orig = global.fetch;
  global.fetch = mockFetch([assistantText('```json\n{"follows": true, "reason": "wrote a test first"}\n```')]);
  try {
    const v = await judgeAdherence({ baseUrl: "http://x/v1", model: "m", procedure: "p", prompt: "u", trajectory: { finalText: "x", toolCalls: [] } });
    assert.equal(v.pass, true);
    assert.match(v.reason, /test/);
  } finally { global.fetch = orig; }
});

// --- R4: full per-case orchestration ---

test("runCase: samples → judge → aggregate, with trajectory recorded", async () => {
  const orig = global.fetch;
  global.fetch = mockFetch([
    assistantToolCall("use_workflow", '{"workflow":"tdd"}'),
    assistantToolCall("save_file", '{"file_name":"byte.py","content":"x"}'),
    assistantToolCall("save_file", '{"file_name":"test_byte.py","content":"t"}'),
    assistantText("Using Test-Driven Development — wrote the test first"),
    assistantText('{"follows": true, "reason": "test before impl"}'),
  ]);
  try {
    const c = { id: "tdd-x", mode: "router", workflow: "tdd", announce: "Test-Driven Development", checks: ["announce", "adherence"], prompt: "make a util" };
    const ctx = {
      baseUrl: "http://x/v1", model: "m", judgeModel: "m",
      skills: SKILLS, skillByName: new Map(SKILLS.map(s => [s.name, s])),
      samples: 1, guardrailMode: "block", tools: [],
    };
    const { caseReport, results, errors } = await runCase(c, ctx);
    assert.equal(errors, 0);
    assert.equal(results.length, 1);
    assert.deepEqual(caseReport.samples[0].toolCalls.map(t => t.name), ["use_workflow", "save_file", "save_file"]);
    assert.equal(caseReport.samples[0].verdict.pass, true);
    assert.equal(caseReport.agg.checkRates.adherence, 1);
    assert.equal(caseReport.agg.checkRates.announce, 1);
  } finally { global.fetch = orig; }
});
