#!/usr/bin/env node
// Validate the skills/ directory (DoD5): required fields, compilable triggers, unique names, examples.
const path = require("node:path");
const { loadSkills, getSkillsDirCandidates, validateSkills } = require("../dist/skills.js");

(async () => {
  const skills = await loadSkills(getSkillsDirCandidates(path.join(__dirname, ".."), process.cwd()));
  const issues = validateSkills(skills);
  console.log(`Loaded ${skills.length} skills: ${skills.map(s => s.name).join(", ")}`);
  if (issues.length === 0) {
    console.log("OK — all skills valid.");
    return;
  }
  for (const i of issues) console.log(`  ISSUE  ${i.skill}: ${i.issue}`);
  process.exitCode = 1;
})();
