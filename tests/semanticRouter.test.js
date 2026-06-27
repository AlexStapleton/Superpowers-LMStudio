const test = require("node:test");
const assert = require("node:assert/strict");
const { cosineSimilarity, semanticMatch, buildEmbeddingText } = require("../dist/semanticRouter.js");

test("cosineSimilarity: identical=1, orthogonal=0, opposite=-1, zero=0", () => {
  assert.equal(cosineSimilarity([1, 0], [1, 0]), 1);
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
  assert.equal(cosineSimilarity([1, 0], [-1, 0]), -1);
  assert.equal(cosineSimilarity([0, 0], [1, 1]), 0);
});

test("semanticMatch returns the best skill above threshold, else null", () => {
  const skills = [
    { name: "debugging", vector: [1, 0, 0] },
    { name: "research", vector: [0, 1, 0] },
  ];
  // query closest to debugging
  const hit = semanticMatch([0.9, 0.1, 0], skills, 0.5);
  assert.equal(hit.name, "debugging");
  assert.ok(hit.score > 0.5);
  // query between, below threshold -> null
  assert.equal(semanticMatch([0.4, 0.4, 0.8], skills, 0.7), null);
  // empty skills -> null
  assert.equal(semanticMatch([1, 0, 0], [], 0.5), null);
});

test("semanticMatch margin rejects ambiguous (near-tie) matches", () => {
  const close = [{ name: "a", vector: [1, 0] }, { name: "b", vector: [0.99, 0.01] }];
  // both score ~1.0 for query [1,0]; gap < margin -> null (don't guess)
  assert.equal(semanticMatch([1, 0], close, 0.3, 0.1), null);
  // clear winner survives the margin
  const clear = [{ name: "a", vector: [1, 0] }, { name: "b", vector: [0, 1] }];
  assert.equal(semanticMatch([0.9, 0.1], clear, 0.3, 0.1).name, "a");
});

test("buildEmbeddingText combines description and examples", () => {
  const t = buildEmbeddingText({ description: "Use when debugging", examples: ["it is broken", "tests fail"] });
  assert.match(t, /Use when debugging/);
  assert.match(t, /broken/);
  assert.match(t, /tests fail/);
  // no examples -> just description
  assert.equal(buildEmbeddingText({ description: "Just this" }), "Just this");
});
