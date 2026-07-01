const test = require("node:test");
const assert = require("node:assert/strict");
const {
  parseMemory, serializeMemory, slugTitle,
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
