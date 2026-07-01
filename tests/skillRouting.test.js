const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { loadSkills, matchTriggers } = require("../dist/skills.js");

const SKILLS_DIR = path.join(__dirname, "..", "skills");

// Benign / off-task messages that MUST NOT route to any workflow (no false positives).
// If a trigger change starts matching one of these, that's a regression.
const NEGATIVES = [
  "pwd",
  "cd into the project",
  "thanks, that's all",
  "what is 2 + 2",
  "is this the right approach",
  "open the file config.ts",
  "list the files in this directory",
  "hello there",
  "what time is it",
  "show me the package.json",
  "rename this variable to userId",
  "good morning",
];

test("at least one skill loads, and every skill declares examples", async () => {
  const skills = await loadSkills([SKILLS_DIR]);
  assert.ok(skills.length > 0, "no skills loaded from skills/");
  for (const s of skills) {
    assert.ok(
      s.examples.length > 0,
      `skill '${s.name}' has no examples — add an 'examples:' list to its frontmatter so routing is eval-covered`,
    );
  }
});

test("each skill example routes to that skill", async (t) => {
  const skills = await loadSkills([SKILLS_DIR]);
  for (const s of skills) {
    for (const example of s.examples) {
      await t.test(`"${example}" -> ${s.name}`, () => {
        const got = matchTriggers(skills, example);
        assert.equal(
          got,
          s.name,
          `example for '${s.name}' routed to '${got}' instead`,
        );
      });
    }
  }
});

// Regression: a planning/analysis request must not be captured by the `tdd` workflow.
// "Build a recommendation … I want to see a plan.md" once matched tdd via the greedy
// `build (a|the|me)` trigger, injecting an unsatisfiable "write a failing test first"
// procedure for a doc-writing task — which sent the 12B into a repetition loop.
test("planning requests route to writing-plans, not tdd", async (t) => {
  const skills = await loadSkills([SKILLS_DIR]);
  const PLAN_PROMPTS = [
    "Build a recommendation for the decomposition. I want to see a plan.md for this",
    "build a plan for the decomposition",
    "I want to see a plan.md for this",
  ];
  for (const p of PLAN_PROMPTS) {
    await t.test(`"${p}" -> writing-plans`, () => {
      const got = matchTriggers(skills, p);
      assert.notEqual(got, "tdd", `planning prompt wrongly captured by tdd`);
      assert.equal(got, "writing-plans", `expected writing-plans, got '${got}'`);
    });
  }
});

test("benign messages route to no skill", async (t) => {
  const skills = await loadSkills([SKILLS_DIR]);
  for (const neg of NEGATIVES) {
    await t.test(`"${neg}" -> null`, () => {
      const got = matchTriggers(skills, neg);
      assert.equal(got, null, `benign message matched '${got}' (false positive)`);
    });
  }
});
