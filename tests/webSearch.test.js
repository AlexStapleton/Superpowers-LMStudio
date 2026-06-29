const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeSearchQueries, stripPageBoilerplate } = require("../dist/webSearch.js");

test("normalizeSearchQueries accepts a single string", () => {
  assert.deepEqual(normalizeSearchQueries("climate change 2026", undefined), ["climate change 2026"]);
});

test("normalizeSearchQueries accepts an array in `query` (the model's actual failing call)", () => {
  // This is the exact shape that hard-failed: web_search{query:["a","b","c"]}.
  assert.deepEqual(
    normalizeSearchQueries(["a", "b", "c"], undefined),
    ["a", "b", "c"],
  );
});

test("normalizeSearchQueries accepts the `queries` plural alias and merges with query", () => {
  assert.deepEqual(
    normalizeSearchQueries("a", ["b", "c"]),
    ["a", "b", "c"],
  );
});

test("normalizeSearchQueries trims, drops empties, dedupes case-insensitively, caps", () => {
  assert.deepEqual(normalizeSearchQueries(["  a ", "", "A", "b"], undefined), ["a", "b"]);
  assert.deepEqual(normalizeSearchQueries(["q1", "q2", "q3", "q4", "q5", "q6"], undefined, 3), ["q1", "q2", "q3"]);
});

test("normalizeSearchQueries returns [] when nothing usable is given", () => {
  assert.deepEqual(normalizeSearchQueries(undefined, undefined), []);
  assert.deepEqual(normalizeSearchQueries("   ", []), []);
  assert.deepEqual(normalizeSearchQueries(42, { not: "an array" }), []);
});

test("stripPageBoilerplate removes icon-sprite runs and skip-to-content, keeps real prose", () => {
  const junk =
    "skip to main content01-access02-use-casesback-esotc-2020Blueskybookcalendarccl-icon-atmosphere-whiteyoutube\n\nThe Global Climate Highlights 2025 report provides authoritative climate data.";
  const out = stripPageBoilerplate(junk);
  assert.ok(!/skip to main content/i.test(out));
  assert.ok(!/ccl-icon-atmosphere/.test(out)); // the long concatenated sprite run is gone
  assert.match(out, /authoritative climate data/); // real sentence survives
});

test("stripPageBoilerplate is a no-op on clean text and handles empty", () => {
  assert.equal(stripPageBoilerplate(""), "");
  assert.equal(stripPageBoilerplate("A short clean paragraph."), "A short clean paragraph.");
});
