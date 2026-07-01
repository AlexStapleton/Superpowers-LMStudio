#!/usr/bin/env node
// Memory value probe: does an injected memory actually change behavior? For each scenario we run the
// SAME prompt twice — memory OFF (date line only) vs memory ON (date + rendered memory + nudge) — and
// check whether the response reflects the remembered fact. Name/location scenarios are things the model
// CANNOT know without memory, so OFF should miss and ON should hit; the preference scenario is softer.
// Opt-in (`npm run memory-probe`); skips cleanly when the LM Studio server is down. Mirrors semantic-probe.
const path = require("node:path");
require("./localEnv.js").loadLocalEnv(path.join(__dirname, "eval.local.env"));
const { probeEndpoint, diagnoseEndpoint, chatOnce } = require("./client.js");
const { renderForInjection } = require("../dist/memory.js");
const { currentDateLine } = require("../dist/promptPreprocessor.js");

const SCENARIOS = [
  { id: "name",     type: "user",       title: "Name",     fact: "The user's name is Alex.",
    prompt: "Greet me by name in one short sentence.",         marker: /\balex\b/i,                 why: "unknown without memory" },
  { id: "location", type: "user",       title: "Location", fact: "The user is based in Sydney, Australia.",
    prompt: "What timezone should I assume for you? One line.", marker: /sydney|australia|ae[ds]t/i, why: "unknown without memory" },
  { id: "lang-pref", type: "preference", title: "Language", fact: "The user prefers Python for scripting.",
    prompt: "Write a one-line hello-world script.",             marker: /python|print\(/i,           why: "softer — model may pick Python anyway" },
];

const NUDGE = "[Memory is ON. Apply the remembered facts above when they are relevant to the request.]";

function systemFor(withMemory, s) {
  const date = currentDateLine(new Date());
  if (!withMemory) return date;
  const rendered = renderForInjection(
    { preamble: "", entries: [{ id: s.id, type: s.type, title: s.title, fact: s.fact, added: "2026-06-30", source: "chat" }] },
    { maxChars: 4000 },
  );
  return `${date}\n\n${rendered}\n\n${NUDGE}`;
}

(async () => {
  const baseUrl = process.env.EVAL_BASE_URL || "http://localhost:1234/v1";
  const model = process.env.EVAL_MODEL || (await probeEndpoint(baseUrl));
  if (!model) {
    console.log(`No chat model reachable at ${baseUrl} (${await diagnoseEndpoint(baseUrl)}).`);
    console.log("Start LM Studio's Local Server (Developer tab) with a chat model, then re-run `npm run memory-probe`.");
    return;
  }
  const samples = Math.max(1, parseInt(process.env.EVAL_SAMPLES || "1", 10));
  console.log(`Model: ${model} @ ${baseUrl}`);
  console.log(`Memory value probe — ${samples} sample(s) per condition. OFF = no memory, ON = memory injected.\n`);

  let offHits = 0, onHits = 0, total = 0;
  for (const s of SCENARIOS) {
    let off = 0, on = 0;
    for (let i = 0; i < samples; i++) {
      const offText = await chatOnce({ baseUrl, model, messages: [
        { role: "system", content: systemFor(false, s) }, { role: "user", content: s.prompt }] });
      const onText = await chatOnce({ baseUrl, model, messages: [
        { role: "system", content: systemFor(true, s) }, { role: "user", content: s.prompt }] });
      if (s.marker.test(offText)) off++;
      if (s.marker.test(onText)) on++;
    }
    offHits += off; onHits += on; total += samples;
    console.log(`${s.id.padEnd(10)} OFF ${off}/${samples}   ON ${on}/${samples}   (${s.why})`);
  }
  console.log(`\nTOTAL   memory OFF ${offHits}/${total}   memory ON ${onHits}/${total}   Δ ${onHits - offHits >= 0 ? "+" : ""}${onHits - offHits}`);
  console.log(onHits > offHits
    ? "→ Memory measurably changed behavior on these scenarios."
    : "→ No measurable improvement — revisit the injection wording or scenarios.");
})();
