const test = require("node:test");
const assert = require("node:assert/strict");
const { findProjectRoot } = require("../dist/projectRoot.js");

// Inject a fake existence check so the test is filesystem-free and OS-agnostic (use posix-style paths).
const existsIn = (set) => (p) => set.has(p.split("\\").join("/"));

test("findProjectRoot walks up to the nearest .git/package.json ancestor", () => {
  const present = existsIn(new Set(["/home/u/proj/.git"]));
  assert.equal(findProjectRoot("/home/u/proj/src/sub", present), "/home/u/proj");
  assert.equal(findProjectRoot("/home/u/proj", present), "/home/u/proj");
});

test("findProjectRoot recognizes package.json as a root marker", () => {
  const present = existsIn(new Set(["/a/b/package.json"]));
  assert.equal(findProjectRoot("/a/b/c/d", present), "/a/b");
});

test("findProjectRoot falls back to the start dir when no marker is found", () => {
  const none = () => false;
  assert.equal(findProjectRoot("/x/y/z", none), "/x/y/z");
});

test("findProjectRoot stops at the filesystem root without looping", () => {
  const none = () => false;
  assert.equal(findProjectRoot("/", none), "/");
});
