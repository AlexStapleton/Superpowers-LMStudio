const test = require("node:test");
const assert = require("node:assert/strict");
const { isTestFile, isSourceCodeFile, evaluateTddGuardrail, evaluateGuardrail, resolveActiveWorkflow, webSearchFetchDirective } = require("../dist/guardrails.js");

// Fetch-before-answer guardrail: a web_search returns snippets, and a 12B will answer from them
// (the #1 failure research.md warns against). Keyed on the SEARCH act, not on the research workflow
// being routed — so it fires even when routing never loaded the procedure.
test("webSearchFetchDirective tells the model to read a source before answering", () => {
  const d = webSearchFetchDirective();
  assert.match(d, /fetch_web_content/);
  assert.match(d, /rag_web_content/);
  assert.match(d, /snippet/i);
});

test("resolveActiveWorkflow: router injection wins; tool invoke is the fallback (gate connects to router path)", () => {
  // The dominant path: router auto-loaded tdd, model never called use_workflow → gate must still fire.
  assert.equal(resolveActiveWorkflow("tdd", null), "tdd");
  // Explicit invoke with no router match → use the tool's choice.
  assert.equal(resolveActiveWorkflow(null, "tdd"), "tdd");
  // Conversation moved on: router now says research, a STALE tool invoke said tdd → router wins.
  assert.equal(resolveActiveWorkflow("research", "tdd"), "research");
  assert.equal(resolveActiveWorkflow(null, null), null);
});

// Step-gate framework (B): debugging requires a reproduction (run_test_command sets testSeen) before
// editing source — "fix before reproduce is guessing".
test("debugging gate is ADVISORY: warns on source-before-reproduction but never blocks", () => {
  const base = { active: "debugging", fileName: "src/app.ts" };
  // no test run yet → warn (non-blocking) in warn mode
  const warn = evaluateGuardrail({ ...base, testSeen: false, mode: "warn" });
  assert.equal(warn.block, false);
  assert.match(warn.warning, /[Rr]eproduce/);
  // even in block mode it only warns (advisory) — an investigative edit is legitimate
  const blockMode = evaluateGuardrail({ ...base, testSeen: false, mode: "block" });
  assert.equal(blockMode.block, false);
  assert.match(blockMode.warning, /[Rr]eproduce/);
  // a reproduction ran → no gate
  assert.equal(evaluateGuardrail({ ...base, testSeen: true, mode: "block" }).warning, null);
  // editing a non-source file (e.g. notes) is never gated
  assert.equal(evaluateGuardrail({ active: "debugging", fileName: "NOTES.md", testSeen: false, mode: "block" }).warning, null);
});

test("evaluateGuardrail: a workflow with no gate row is a no-op", () => {
  assert.equal(evaluateGuardrail({ active: "research", fileName: "src/x.ts", testSeen: false, mode: "block" }).block, false);
  assert.equal(evaluateGuardrail({ active: null, fileName: "src/x.ts", testSeen: false, mode: "block" }).block, false);
});

// Regression guard for the disconnect bug: a router-injected tdd must block source-before-test even
// though no use_workflow tool call happened (activeWorkflow would be null).
test("router-injected tdd blocks source-before-test with no use_workflow call", () => {
  const active = resolveActiveWorkflow("tdd", null); // router path only
  assert.equal(evaluateGuardrail({ active, testSeen: false, fileName: "src/app.ts", mode: "block" }).block, true);
});

test("evaluateGuardrail dispatches: tdd test-first AND brainstorming no-source-code", () => {
  // tdd path delegates to the test-first rule
  assert.equal(evaluateGuardrail({ active: "tdd", testSeen: false, fileName: "app.py", mode: "block" }).block, true);
  assert.equal(evaluateGuardrail({ active: "tdd", testSeen: true, fileName: "app.py", mode: "block" }).block, false);
  // brainstorming blocks source code (design phase), allows docs
  assert.equal(evaluateGuardrail({ active: "brainstorming", testSeen: false, fileName: "app.ts", mode: "block" }).block, true);
  assert.equal(evaluateGuardrail({ active: "brainstorming", testSeen: false, fileName: "design.md", mode: "block" }).block, false);
  // warn never blocks; off never fires; unrelated workflow no-op
  assert.equal(evaluateGuardrail({ active: "brainstorming", testSeen: false, fileName: "app.ts", mode: "warn" }).block, false);
  assert.match(evaluateGuardrail({ active: "brainstorming", testSeen: false, fileName: "app.ts", mode: "warn" }).warning, /design/i);
  // debugging now HAS a gate (B) but it's ADVISORY: warns, never blocks (see dedicated test above)
  const dbg = evaluateGuardrail({ active: "debugging", testSeen: false, fileName: "app.ts", mode: "block" });
  assert.equal(dbg.block, false);
  assert.match(dbg.warning, /[Rr]eproduce/);
});

test("isTestFile recognizes common test naming", () => {
  for (const f of ["test_byte.py", "byte_test.go", "byte.test.ts", "foo.spec.js", "tests/foo.py", "src/__tests__/a.ts"]) {
    assert.equal(isTestFile(f), true, f);
  }
  for (const f of ["byte_converter.py", "src/app.ts", "README.md", "latest.js"]) {
    assert.equal(isTestFile(f), false, f);
  }
});

test("isSourceCodeFile is true for code but not tests or docs", () => {
  assert.equal(isSourceCodeFile("byte_converter.py"), true);
  assert.equal(isSourceCodeFile("src/app.ts"), true);
  assert.equal(isSourceCodeFile("byte.test.ts"), false);
  assert.equal(isSourceCodeFile("README.md"), false);
  assert.equal(isSourceCodeFile("data.json"), false);
});

test("evaluateTddGuardrail blocks source-before-test only when TDD active and no test seen", () => {
  const base = { active: "tdd", testSeen: false, fileName: "byte_converter.py", mode: "block" };
  assert.equal(evaluateTddGuardrail(base).block, true);
  assert.match(evaluateTddGuardrail(base).warning, /test/i);

  // warn mode: never blocks, but warns
  assert.equal(evaluateTddGuardrail({ ...base, mode: "warn" }).block, false);
  assert.match(evaluateTddGuardrail({ ...base, mode: "warn" }).warning, /test/i);

  // does not fire when: off, not tdd, test already seen, or non-source file
  assert.equal(evaluateTddGuardrail({ ...base, mode: "off" }).block, false);
  assert.equal(evaluateTddGuardrail({ ...base, active: "debugging" }).block, false);
  assert.equal(evaluateTddGuardrail({ ...base, testSeen: true }).block, false);
  assert.equal(evaluateTddGuardrail({ ...base, fileName: "notes.md" }).block, false);
  assert.equal(evaluateTddGuardrail({ ...base, fileName: "byte.test.ts" }).block, false);
});
