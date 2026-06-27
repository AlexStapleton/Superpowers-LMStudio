const test = require("node:test");
const assert = require("node:assert/strict");
const { parseSkillMarkdown } = require("../dist/skills.js");

const SAMPLE = [
  "---",
  "name: debugging",
  "description: Use when debugging",
  "announce: Systematic Debugging",
  "triggers:",
  '  - "\\\\bbug\\\\b"',
  '  - "not working"',
  "---",
  "",
  "Body line one.",
  "Body line two.",
].join("\n");

test("parseSkillMarkdown extracts frontmatter and body", () => {
  const skill = parseSkillMarkdown(SAMPLE);
  assert.equal(skill.name, "debugging");
  assert.equal(skill.description, "Use when debugging");
  assert.equal(skill.announce, "Systematic Debugging");
  assert.deepEqual(skill.triggers, ["\\bbug\\b", "not working"]);
  assert.match(skill.body, /Body line one\./);
  assert.ok(!skill.body.includes("---"));
});

test("parseSkillMarkdown throws on missing required field", () => {
  const bad = "---\nname: x\n---\nbody";
  assert.throws(() => parseSkillMarkdown(bad), /description/);
});

const { matchTriggers, renderDispatcherTable } = require("../dist/skills.js");

const SKILLS = [
  { name: "debugging", description: "Use when debugging", announce: "Systematic Debugging",
    triggers: ["\\bbug\\b", "not working"], body: "DBG" },
  { name: "research", description: "Use when researching", announce: "Research",
    triggers: ["\\bresearch\\b"], body: "RES" },
];

test("matchTriggers matches case-insensitively and returns the skill name", () => {
  assert.equal(matchTriggers(SKILLS, "There is a BUG in login"), "debugging");
  assert.equal(matchTriggers(SKILLS, "Please research React 19"), "research");
});

test("matchTriggers returns null on benign input (no false positives)", () => {
  assert.equal(matchTriggers(SKILLS, "thanks!"), null);
  assert.equal(matchTriggers(SKILLS, "open the file config.ts"), null);
  assert.equal(matchTriggers(SKILLS, "what is 2 + 2"), null);
});

test("renderDispatcherTable lists every skill with name and description", () => {
  const table = renderDispatcherTable(SKILLS);
  assert.match(table, /debugging/);
  assert.match(table, /Use when debugging/);
  assert.match(table, /research/);
});

const { buildWorkflowToolResult, decideRouterInjection } = require("../dist/skills.js");

test("buildWorkflowToolResult returns announce instruction and body", () => {
  const skill = { name: "debugging", description: "d", announce: "Systematic Debugging",
    triggers: [], body: "STEP ONE" };
  const r = buildWorkflowToolResult(skill);
  assert.match(r.announce, /Using Systematic Debugging/);
  assert.equal(r.instructions, "STEP ONE");
});

test("decideRouterInjection returns body on first match, null on consecutive repeat", () => {
  const skills = [{ name: "debugging", description: "d", announce: "Systematic Debugging",
    triggers: ["\\bbug\\b"], body: "DBG" }];
  const first = decideRouterInjection(skills, "a bug appeared", null);
  assert.equal(first.name, "debugging");
  assert.equal(first.body, "DBG");
  const repeat = decideRouterInjection(skills, "another bug", "debugging");
  assert.equal(repeat, null);
});

test("decideRouterInjection returns null when nothing matches", () => {
  const skills = [{ name: "debugging", description: "d", announce: "a", triggers: ["\\bbug\\b"], body: "DBG" }];
  assert.equal(decideRouterInjection(skills, "hello there", null), null);
});

const { getSkillsDirCandidates, loadSkills } = require("../dist/skills.js");

test("getSkillsDirCandidates prefers plugin root then workspace", () => {
  const c = getSkillsDirCandidates("/plugin", "/ws");
  assert.ok(c[0].endsWith("skills"));
  assert.ok(c.some(p => p.includes("ws")));
});

test("loadSkills reads the real skills/ dir and parses all core skills", async () => {
  const path = require("node:path");
  const pluginRoot = path.resolve(__dirname, "..");
  const skills = await loadSkills([path.join(pluginRoot, "skills")]);
  const names = skills.map(s => s.name).sort();
  assert.deepEqual(names, ["brainstorming", "debugging", "explaining-code", "research", "tdd", "verification"]);
});

test("loadSkills returns [] for a missing dir (graceful)", async () => {
  const skills = await loadSkills(["/nonexistent/skills/dir"]);
  assert.deepEqual(skills, []);
});
