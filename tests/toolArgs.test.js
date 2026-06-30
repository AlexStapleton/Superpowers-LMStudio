const test = require("node:test");
const assert = require("node:assert/strict");
const { coerceFileName, coerceFileContent } = require("../dist/toolArgs.js");

test("coerceFileName accepts file_name and the aliases the 12B emits", () => {
  assert.equal(coerceFileName({ file_name: "a.js" }), "a.js");
  assert.equal(coerceFileName({ path: "b.js" }), "b.js");
  assert.equal(coerceFileName({ name: "c.js" }), "c.js");
  assert.equal(coerceFileName({ filepath: "d.js" }), "d.js");
  assert.equal(coerceFileName({ file_path: "e.js" }), "e.js");
});

test("coerceFileName prefers the canonical file_name and rejects empty/non-string", () => {
  assert.equal(coerceFileName({ file_name: "real.js", path: "alias.js" }), "real.js");
  assert.equal(coerceFileName({ file_name: "   " }), undefined);
  assert.equal(coerceFileName({}), undefined);
  assert.equal(coerceFileName({ file_name: 42 }), undefined);
});

test("coerceFileContent accepts content + aliases and PRESERVES empty string", () => {
  assert.equal(coerceFileContent({ content: "x" }), "x");
  assert.equal(coerceFileContent({ data: "y" }), "y");
  assert.equal(coerceFileContent({ text: "z" }), "z");
  assert.equal(coerceFileContent({ content: "" }), ""); // empty file is valid, not "missing"
  assert.equal(coerceFileContent({}), undefined);
  assert.equal(coerceFileContent({ content: 42 }), undefined);
});
