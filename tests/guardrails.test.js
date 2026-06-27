const test = require("node:test");
const assert = require("node:assert/strict");
const { isTestFile, isSourceCodeFile, evaluateTddGuardrail } = require("../dist/guardrails.js");

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
