#!/usr/bin/env node
// Diagnostic (C1): prints the cosine similarity of each tool/benign prompt against every skill, with
// the nomic prefixes applied — so we can see the real scores and pick a threshold (or learn the
// embedding approach needs work). Fast: embeddings only, no chat/judge.
const path = require("node:path");
require("./localEnv.js").loadLocalEnv(path.join(__dirname, "eval.local.env"));
const { loadSkills, getSkillsDirCandidates } = require("../dist/skills.js");
const { cosineSimilarity, buildEmbeddingText, QUERY_PREFIX, DOC_PREFIX } = require("../dist/semanticRouter.js");
const { embed, probeEmbeddings } = require("./client.js");
const { CASES } = require("./cases.js");

(async () => {
  const baseUrl = process.env.EVAL_BASE_URL || "http://localhost:1234/v1";
  const model = process.env.EVAL_EMBED_MODEL || "nomic-ai/nomic-embed-text-v1.5-GGUF";
  const probe = await probeEmbeddings(baseUrl, model);
  if (!probe.ok) {
    console.log(`embeddings unavailable: ${probe.error}`);
    return;
  }
  console.log(`embed model: ${model} (dim ${probe.dim})   prefixes: query="${QUERY_PREFIX}" doc="${DOC_PREFIX}"\n`);

  const skills = await loadSkills(getSkillsDirCandidates(path.join(__dirname, ".."), process.cwd()));
  const docVecs = await embed(baseUrl, model, skills.map(s => DOC_PREFIX + buildEmbeddingText(s)));
  if (!docVecs) { console.log("failed to embed skill docs"); return; }

  // tool-mode cases (incl. benign) are the ones that rely on routing
  for (const c of CASES.filter(x => x.mode === "tool")) {
    const q = await embed(baseUrl, model, [QUERY_PREFIX + c.prompt]);
    if (!q) { console.log(`embed failed for ${c.id}`); continue; }
    const scored = skills
      .map((s, i) => ({ name: s.name, score: cosineSimilarity(q[0], docVecs[i]) }))
      .sort((a, b) => b.score - a.score);
    const want = c.workflow || "(benign → none)";
    const top3 = scored.slice(0, 3).map(s => `${s.name} ${s.score.toFixed(2)}`).join("  ");
    const wantRank = c.workflow ? scored.findIndex(s => s.name === c.workflow) : -1;
    const wantNote = c.workflow ? `  want '${c.workflow}' is #${wantRank + 1} @ ${scored[wantRank].score.toFixed(2)}` : "";
    console.log(`${c.id.padEnd(14)} want=${want}`);
    console.log(`   top: ${top3}${wantNote}`);
  }
})();
