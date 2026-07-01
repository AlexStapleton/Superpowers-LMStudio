const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { isWithinBoundary, resolveMemoryPath, parseProjectCommand } = require("../dist/projectBoundary.js");

test("isWithinBoundary: inside, equal, and nested are true", () => {
  assert.equal(isWithinBoundary("/proj", "/proj"), true);
  assert.equal(isWithinBoundary("/proj", "/proj/sub/file.ts"), true);
});

test("isWithinBoundary: outside and sibling-prefix are false", () => {
  assert.equal(isWithinBoundary("/proj", "/other/file.ts"), false);
  assert.equal(isWithinBoundary("/proj", "/proj-x/file.ts"), false); // sibling prefix must NOT match
});

test("resolveMemoryPath: global always points at the toolbox home", () => {
  assert.equal(resolveMemoryPath("global", "/proj", "/home/tb"), path.join("/home/tb", "memory.md"));
  assert.equal(resolveMemoryPath("global", null, "/home/tb"), path.join("/home/tb", "memory.md"));
});

test("resolveMemoryPath: auto/project follow the project dir, fall back to global when unset", () => {
  assert.equal(resolveMemoryPath("auto", "/proj", "/home/tb"), path.join("/proj", ".beledarian", "memory.md"));
  assert.equal(resolveMemoryPath("auto", null, "/home/tb"), path.join("/home/tb", "memory.md"));
  assert.equal(resolveMemoryPath("project", "/proj", "/home/tb"), path.join("/proj", ".beledarian", "memory.md"));
  assert.equal(resolveMemoryPath("project", null, "/home/tb"), path.join("/home/tb", "memory.md"));
});

test("parseProjectCommand: set / show / clear / none with tolerance", () => {
  assert.deepEqual(parseProjectCommand("/project C:\\work\\app"), { kind: "set", path: "C:\\work\\app" });
  assert.deepEqual(parseProjectCommand('  /PROJECT   "/a b/c"  '), { kind: "set", path: "/a b/c" });
  assert.deepEqual(parseProjectCommand("/project"), { kind: "show" });
  assert.deepEqual(parseProjectCommand("/project clear"), { kind: "clear" });
  assert.deepEqual(parseProjectCommand("just a normal message"), { kind: "none" });
  assert.deepEqual(parseProjectCommand("/projector lens"), { kind: "none" }); // must not loosely match the prefix
});
