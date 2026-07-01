const test = require("node:test");
const assert = require("node:assert/strict");
const {
  parseMemory, serializeMemory, slugTitle,
  upsertMemory, forgetMemory, stringSimilarityMatch, renderForInjection,
} = require("../dist/memory.js");

test("slugTitle: first 8 words, sentence-cased title + kebab id", () => {
  const { title, id } = slugTitle("user prefers concise answers without preamble or filler text here");
  assert.equal(title, "User prefers concise answers without preamble or filler");
  assert.equal(id, "user-prefers-concise-answers-without-preamble-or-filler");
  assert.equal(slugTitle("!!!").id, "memory"); // never empty
});

test("parseMemory: reads structured blocks with metadata", () => {
  const md = [
    "# Memory", "",
    "## preference: Prefers concise answers",
    "<!-- id: prefers-concise-answers | added: 2026-06-30 | source: chat -->",
    "User wants short, direct responses.", "",
  ].join("\n");
  const p = parseMemory(md);
  assert.equal(p.entries.length, 1);
  assert.deepEqual(p.entries[0], {
    id: "prefers-concise-answers", type: "preference", title: "Prefers concise answers",
    fact: "User wants short, direct responses.", added: "2026-06-30", updated: undefined, source: "chat",
  });
});

test("parseMemory: legacy '- [ts] fact' lines convert to user entries", () => {
  const md = "# Long-Term Memory\n- [2026-06-29T10:00:00Z] Likes dark mode";
  const p = parseMemory(md);
  assert.equal(p.entries.length, 1);
  assert.equal(p.entries[0].type, "user");
  assert.equal(p.entries[0].fact, "Likes dark mode");
  assert.equal(p.entries[0].added, "2026-06-29");
  assert.equal(p.preamble, "# Long-Term Memory");
});

test("serializeMemory round-trips and is idempotent", () => {
  const md = [
    "# Memory", "",
    "## project: Building the plugin",
    "<!-- id: building-the-plugin | added: 2026-06-30 | updated: 2026-06-30 | source: chat -->",
    "Target model is Gemma 12B.", "",
  ].join("\n");
  const once = serializeMemory(parseMemory(md));
  const twice = serializeMemory(parseMemory(once));
  assert.equal(once, twice); // stable
  assert.match(once, /## project: Building the plugin/);
  assert.match(once, /updated: 2026-06-30/);
});

test("upsertMemory: adds a new entry, de-collides duplicate ids", () => {
  let p = { preamble: "", entries: [] };
  p = upsertMemory(p, { fact: "Likes dark mode", type: "user", date: "2026-06-30" }).next;
  const r2 = upsertMemory(p, { fact: "Likes dark mode too", type: "user", date: "2026-06-30" });
  assert.equal(r2.action, "added");
  const ids = r2.next.entries.map(e => e.id);
  assert.equal(new Set(ids).size, ids.length); // ids unique
});

test("upsertMemory: matchId updates in place and bumps 'updated'", () => {
  const base = { preamble: "", entries: [
    { id: "likes-dark-mode", type: "user", title: "Likes dark mode", fact: "old", added: "2026-06-01", source: "chat" },
  ]};
  const r = upsertMemory(base, { fact: "Prefers dark mode everywhere", type: "preference", date: "2026-06-30", matchId: "likes-dark-mode" });
  assert.equal(r.action, "updated");
  assert.equal(r.next.entries.length, 1);
  assert.equal(r.next.entries[0].fact, "Prefers dark mode everywhere");
  assert.equal(r.next.entries[0].type, "preference");
  assert.equal(r.next.entries[0].updated, "2026-06-30");
});

test("forgetMemory: removes by id, reports not_found", () => {
  const base = { preamble: "", entries: [
    { id: "a", type: "user", title: "A", fact: "x", added: "2026-06-30", source: "chat" },
  ]};
  assert.equal(forgetMemory(base, { matchId: "missing" }).action, "not_found");
  const r = forgetMemory(base, { matchId: "a" });
  assert.equal(r.action, "forgotten");
  assert.equal(r.next.entries.length, 0);
});

test("stringSimilarityMatch: matches near-duplicate, ignores unrelated", () => {
  const entries = [
    { id: "dark", type: "user", title: "T", fact: "user likes dark mode in the editor", added: "", source: "chat" },
  ];
  assert.equal(stringSimilarityMatch("user likes dark mode in editor", entries), "dark");
  assert.equal(stringSimilarityMatch("completely unrelated sentence about cats", entries), null);
});

test("renderForInjection: groups by type; degrades to titles-only over budget", () => {
  const p = { preamble: "", entries: [
    { id: "a", type: "preference", title: "Concise answers", fact: "short replies", added: "", source: "chat" },
    { id: "b", type: "project", title: "Plugin work", fact: "gemma 12b target", added: "", source: "chat" },
  ]};
  const full = renderForInjection(p, { maxChars: 10000 });
  assert.match(full, /### preference/);
  assert.match(full, /- Concise answers: short replies/);
  const tiny = renderForInjection(p, { maxChars: 40 });
  assert.match(tiny, /titles only/i);
  assert.match(tiny, /- Concise answers/);
  assert.doesNotMatch(tiny, /short replies/);
  assert.equal(renderForInjection({ preamble: "", entries: [] }, { maxChars: 100 }), "");
});
