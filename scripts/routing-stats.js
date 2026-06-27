#!/usr/bin/env node
// Routing observability summary (backlog A2).
// Reads the JSONL routing log and reports tool-path vs router-path usage.
// Run: npm run routing-stats   (builds first, then reads ~/.beledarians-llm-toolbox/routing-log.jsonl)

const fs = require("node:fs");
const { summarizeRoutingLog, getRoutingLogPath } = require("../dist/routingLog.js");

const logPath = getRoutingLogPath();
let content;
try {
  content = fs.readFileSync(logPath, "utf-8");
} catch {
  console.log(`No routing log yet at: ${logPath}`);
  console.log("Enable Debug Logging in the plugin settings, then chat with the assistant to generate events.");
  process.exit(0);
}

const s = summarizeRoutingLog(content);
const loaded = s.router.injected + s.toolCalls;

console.log(`Routing log: ${logPath}`);
console.log(`Total events: ${s.totalEvents}  (parse errors: ${s.parseErrors})`);
console.log("");
console.log(`Workflows loaded: ${loaded}`);
console.log(`  via router (code backstop):    ${s.router.injected}`);
console.log(`  via use_workflow tool (model):  ${s.toolCalls}`);
if (loaded > 0) {
  const toolPct = Math.round((s.toolCalls / loaded) * 100);
  console.log(`  -> model self-invoked the tool ${toolPct}% of the time`);
}
console.log("");
console.log(`Router turns: ${s.routerTurns}  (injected ${s.router.injected}, deduped ${s.router.deduped}, no-match ${s.router.noMatch}, disabled ${s.router.disabled})`);
console.log("");
console.log("By workflow (router-injected):", JSON.stringify(s.byWorkflowRouter));
console.log("By workflow (tool-called):    ", JSON.stringify(s.byWorkflowTool));
