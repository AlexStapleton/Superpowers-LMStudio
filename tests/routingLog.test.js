const test = require("node:test");
const assert = require("node:assert/strict");
const { summarizeRoutingLog } = require("../dist/routingLog.js");

test("summarizeRoutingLog returns zeros for empty input", () => {
  const s = summarizeRoutingLog("");
  assert.equal(s.totalEvents, 0);
  assert.equal(s.routerTurns, 0);
  assert.equal(s.toolCalls, 0);
});

test("summarizeRoutingLog aggregates router and tool events", () => {
  const lines = [
    { kind: "router", matched: "debugging", action: "injected", promptPreview: "there is a bug" },
    { kind: "router", matched: "debugging", action: "deduped", promptPreview: "another bug" },
    { kind: "router", matched: null, action: "no-match", promptPreview: "pwd" },
    { kind: "router", matched: "tdd", action: "disabled", promptPreview: "implement x" },
    { kind: "tool", workflow: "explaining-code" },
    { kind: "tool", workflow: "explaining-code" },
    { kind: "tool", workflow: "debugging" },
  ].map(e => JSON.stringify({ ts: "2026-06-27T00:00:00Z", ...e })).join("\n");

  const s = summarizeRoutingLog(lines);
  assert.equal(s.totalEvents, 7);
  assert.equal(s.routerTurns, 4);
  assert.equal(s.toolCalls, 3);
  assert.equal(s.router.injected, 1);
  assert.equal(s.router.deduped, 1);
  assert.equal(s.router.noMatch, 1);
  assert.equal(s.router.disabled, 1);
  assert.deepEqual(s.byWorkflowRouter, { debugging: 1 });
  assert.deepEqual(s.byWorkflowTool, { "explaining-code": 2, debugging: 1 });
});

test("summarizeRoutingLog counts malformed lines without crashing", () => {
  const input = [
    JSON.stringify({ ts: "t", kind: "tool", workflow: "tdd" }),
    "{ not valid json",
    "",
    JSON.stringify({ ts: "t", kind: "router", matched: null, action: "no-match", promptPreview: "x" }),
  ].join("\n");
  const s = summarizeRoutingLog(input);
  assert.equal(s.parseErrors, 1);
  assert.equal(s.toolCalls, 1);
  assert.equal(s.routerTurns, 1);
});
