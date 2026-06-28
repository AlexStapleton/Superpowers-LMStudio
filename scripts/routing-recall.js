// Offline routing recall/precision over the eval corpus (B3).
// Runs the KEYWORD router (matchTriggers) over every case in eval/cases.js and reports:
//   - recall: labeled prompts that routed to the right skill
//   - benign precision: benign prompts that correctly routed nowhere
//   - per-skill recall, plus the exact misroutes and false positives
// Keyword-only by design so it's deterministic and needs no model. The semantic router is the
// recall backstop measured separately by `npm run eval` (needs an embedding model).
const path = require("node:path");
const { matchTriggers, loadSkills } = require("../dist/skills.js");
const { summarizeRouting } = require("../dist/evalAnalysis.js");
const { CASES } = require("../eval/cases.js");

(async () => {
  const skills = await loadSkills([path.join(__dirname, "..", "skills")]);
  const outcomes = CASES.map(c => ({
    id: c.id,
    expected: c.workflow ?? null,
    got: matchTriggers(skills, c.prompt),
  }));
  const r = summarizeRouting(outcomes);

  const pct = n => (n * 100).toFixed(0) + "%";
  console.log(`\nKeyword routing over ${CASES.length} cases:`);
  console.log(`  recall:           ${r.recallHit}/${r.recallTotal} (${pct(r.recallRate)})  [rest rely on the semantic router]`);
  console.log(`  benign precision: ${r.benignClean}/${r.benignTotal} (${pct(r.benignRate)})  [must be 100% — false positives derail small models]`);

  console.log("\n  per-skill recall:");
  for (const [name, s] of Object.entries(r.perSkill).sort()) {
    console.log(`    ${name.padEnd(24)} ${s.hit}/${s.total}`);
  }

  if (r.falsePositives.length) {
    console.log("\n  ⚠ FALSE POSITIVES (benign prompt routed to a skill):");
    for (const o of r.falsePositives) console.log(`    ${o.id} -> ${o.got}`);
  }
  if (r.misroutes.length) {
    console.log("\n  misroutes / keyword misses (expected vs got):");
    for (const o of r.misroutes) console.log(`    ${o.id}: want ${o.expected}, got ${o.got ?? "(none)"}`);
  }

  // Exit non-zero only on a benign false positive — that's a real defect; keyword misses are expected.
  process.exit(r.falsePositives.length ? 1 : 0);
})();
