const test = require("node:test");
const assert = require("node:assert/strict");
const { matchGlob } = require("../dist/glob.js");

test("matchGlob: * matches within a segment, not across /", () => {
  assert.equal(matchGlob("src/foo.ts", "src/*.ts"), true);
  assert.equal(matchGlob("src/a/foo.ts", "src/*.ts"), false); // * does not cross /
  assert.equal(matchGlob("foo.test.js", "*.test.js"), true);
});

test("matchGlob: ** crosses directories and **/ matches zero dirs", () => {
  assert.equal(matchGlob("a/b/c/foo.ts", "**/foo.ts"), true);
  assert.equal(matchGlob("foo.ts", "**/foo.ts"), true); // zero dirs
  assert.equal(matchGlob("a/b/.ssh/id_rsa", "**/.ssh/**"), true);
  assert.equal(matchGlob("home/u/.ssh", "**/.ssh"), true);
});

test("matchGlob: normalizes Windows backslashes and is case-insensitive", () => {
  assert.equal(matchGlob("C:\\Users\\x\\.ssh\\id_rsa", "**/.ssh/**"), true);
  assert.equal(matchGlob("src/Foo.TS", "src/*.ts"), true);
});

test("matchGlob: regex specials in the path are treated literally", () => {
  assert.equal(matchGlob("a+b/file.ts", "a+b/*.ts"), true);
  assert.equal(matchGlob("axb/file.ts", "a+b/*.ts"), false);
});
