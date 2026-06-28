const test = require("node:test");
const assert = require("node:assert/strict");
const { browserCandidatePaths } = require("../dist/findBrowser.js");

test("browserCandidatePaths: Windows includes Chrome and Edge", () => {
  const c = browserCandidatePaths("win32", { "PROGRAMFILES": "C:\\Program Files", "PROGRAMFILES(X86)": "C:\\Program Files (x86)" }, "C:\\Users\\x");
  assert.ok(c.some(p => /chrome\.exe$/i.test(p)));
  assert.ok(c.some(p => /msedge\.exe$/i.test(p)), "Edge fallback (always present on Windows)");
});

test("browserCandidatePaths: macOS and Linux return known paths", () => {
  assert.ok(browserCandidatePaths("darwin", {}, "/Users/x").some(p => /Google Chrome$/.test(p)));
  assert.ok(browserCandidatePaths("linux", {}, "/home/x").some(p => p === "/usr/bin/chromium"));
});
