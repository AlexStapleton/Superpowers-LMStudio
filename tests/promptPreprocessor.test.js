const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { getSubAgentDocsCandidatePaths, currentDateLine } = require("../dist/promptPreprocessor.js");

// Date injection: a 12B won't reliably call get_current_datetime, so "next/latest/current" questions
// are unanswerable without an ambient date. Pure + local-TZ-stable (local construction + local getters).
test("currentDateLine formats the local date as 'Today's date is YYYY-MM-DD.'", () => {
  assert.equal(currentDateLine(new Date(2026, 5, 29)), "Today's date is 2026-06-29.");
  assert.equal(currentDateLine(new Date(2026, 0, 5)), "Today's date is 2026-01-05.");
});

test("getSubAgentDocsCandidatePaths prefers plugin path then workspace fallback", () => {
  const workspace = path.resolve("/tmp/workspace");
  const candidates = getSubAgentDocsCandidatePaths(workspace);

  // Returns 4 paths: plugin root, plugin instructions/, workspace instructions/, workspace root
  assert.equal(candidates.length, 4);
  
  // Plugin paths come first (root and instructions/)
  assert.ok(candidates[0].endsWith("subagent_docs.md"));
  assert.ok(candidates[1].includes("instructions") && candidates[1].endsWith("subagent_docs.md"));
  
  // Workspace fallbacks come last (instructions/ then root)
  assert.ok(candidates[2].includes(workspace) || candidates[2].includes("\\tmp\\workspace") || candidates[2].includes("/tmp/workspace"));
  assert.ok(candidates[3].includes(workspace) || candidates[3].includes("\\tmp\\workspace") || candidates[3].includes("/tmp/workspace"));
});
