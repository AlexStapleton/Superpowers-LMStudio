const test = require("node:test");
const assert = require("node:assert/strict");
const {
  parseMemory, serializeMemory, slugTitle,
  upsertMemory, forgetMemory, stringSimilarityMatch, renderForInjection,
  extractRememberDirective, inferMemoryType, extractCorrectionDirective,
  consolidateMemory, parseMemoryCommand,
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

test("extractRememberDirective: captures explicit memory phrasing", () => {
  assert.equal(extractRememberDirective("Remember that I prefer concise answers."), "I prefer concise answers");
  assert.equal(extractRememberDirective("remember: my name is Alex"), "my name is Alex");
  assert.equal(extractRememberDirective("please remember I use TypeScript"), "I use TypeScript");
  assert.equal(extractRememberDirective("note that we deploy on Fridays"), "we deploy on Fridays");
  assert.equal(extractRememberDirective("don't forget that the config lives in .env"), "the config lives in .env");
  assert.equal(extractRememberDirective("Keep in mind I'm based in Sydney"), "I'm based in Sydney");
  assert.equal(extractRememberDirective("For future reference, the staging URL is example.com"), "the staging URL is example.com");
});

test("extractRememberDirective: ignores questions, todos, and unrelated text", () => {
  assert.equal(extractRememberDirective("Do you remember the IPCC report?"), null); // question
  assert.equal(extractRememberDirective("remember our first meeting?"), null);       // reminiscence (ends ?)
  assert.equal(extractRememberDirective("remember to buy milk"), null);              // todo, not a fact
  assert.equal(extractRememberDirective("Summarize the latest report"), null);       // unrelated
  assert.equal(extractRememberDirective(""), null);
});

test("inferMemoryType: light classification with user default", () => {
  assert.equal(inferMemoryType("I prefer concise answers"), "preference");
  assert.equal(inferMemoryType("always use TypeScript"), "preference");
  assert.equal(inferMemoryType("we deploy the repo on Fridays"), "project");
  assert.equal(inferMemoryType("my name is Alex"), "user");
});

test("extractCorrectionDirective: captures corrections of durable facts", () => {
  assert.equal(extractCorrectionDirective("No, I prefer Rust"), "I prefer Rust");
  assert.equal(extractCorrectionDirective("actually my name is Alex"), "my name is Alex");
  assert.equal(extractCorrectionDirective("I told you I use TypeScript"), "I use TypeScript");
  assert.equal(extractCorrectionDirective("correction: the staging url is stg.example.com"), "the staging url is stg.example.com");
  assert.equal(extractCorrectionDirective("that's wrong, I'm based in Berlin"), "I'm based in Berlin");
});

test("extractCorrectionDirective: ignores task-level corrections and unrelated text", () => {
  assert.equal(extractCorrectionDirective("no, use the other file"), null);   // task correction, not a durable fact
  assert.equal(extractCorrectionDirective("actually summarize the report"), null);
  assert.equal(extractCorrectionDirective("that looks correct"), null);
  assert.equal(extractCorrectionDirective(""), null);
});

test("consolidateMemory: merges near-duplicates, keeps distinct, drops oldest over cap", () => {
  const p = { preamble: "", entries: [
    { id: "a", type: "preference", title: "Dark mode", fact: "I prefer dark mode", added: "2026-06-01", source: "chat" },
    { id: "b", type: "preference", title: "Dark mode", fact: "I prefer the dark mode", added: "2026-06-10", updated: "2026-06-10", source: "chat" },
    { id: "c", type: "user", title: "Name", fact: "my name is Alex", added: "2026-06-05", source: "chat" },
  ]};
  const r = consolidateMemory(p, { similarity: 0.7 });
  assert.equal(r.merged, 1);                       // the two dark-mode prefs merge (jaccard 0.8)
  assert.equal(r.next.entries.length, 2);          // merged pref + name
  const pref = r.next.entries.find(e => e.type === "preference");
  assert.equal(pref.fact, "I prefer the dark mode"); // newer (has updated) kept

  const capped = consolidateMemory(p, { similarity: 0.99, maxEntries: 2 }); // no merges, cap drops oldest
  assert.equal(capped.merged, 0);
  assert.equal(capped.dropped, 1);
  assert.equal(capped.next.entries.length, 2);
  assert.ok(!capped.next.entries.some(e => e.id === "a")); // "a" (oldest, 2026-06-01) dropped
});

test("parseMemoryCommand: show / consolidate / none", () => {
  assert.deepEqual(parseMemoryCommand("/memory"), { kind: "show" });
  assert.deepEqual(parseMemoryCommand("  /MEMORY  "), { kind: "show" });
  assert.deepEqual(parseMemoryCommand("/memory consolidate"), { kind: "consolidate" });
  assert.deepEqual(parseMemoryCommand("/memory prune"), { kind: "consolidate" });
  assert.deepEqual(parseMemoryCommand("what do you remember?"), { kind: "none" });
});
