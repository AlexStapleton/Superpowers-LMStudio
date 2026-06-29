# Harness improvements — session 2026-06-29

Autonomous session. Everything below is **committed to local `main`** (build clean, 257 tests pass)
but **not pushed** — see Decision 1. Each item is an independent commit so you can review/revert
granularly.

## Shipped this session (committed, local)

| Commit | What | Confidence |
|--------|------|------------|
| `2a038b1` | `web_search` accepts `query` as string\|array + `queries[]` alias, runs each & merges; `fetch_web_content` strips nav/boilerplate; DuckDuckGo snippet selector made multi-class tolerant + instrumented | High (multi-query/strip unit-tested); DDG selector = best-effort, see Decision 3 |
| `e788c34` | `fetch_web_content` + `rag_web_content`: browser User-Agent + 15s timeout; RAG output boilerplate-stripped | High |
| `cf43f48` | Eval now injects the ambient date and stubs `web_search`/`fetch_web_content`/`rag_web_content`; new soft `fetchedSources` check on all 4 research cases — regression guard for D3 | High |
| `1745051` | Cap merged `web_search` results at 12 (bounds 12B context with multi-query) | High |
| `ee6689b` | Wikipedia API fetches also send the browser UA | High |

Prior pushed work this session: date injection + fetch-before-answer guardrail (`aff1cee`),
delegation-hint gating (`37880ff`).

---

## Decisions for you

### 1. Push the 5 local commits to GitHub
They're on local `main`, ahead of `origin/main` by 5 commits, unpushed. Direct push to `main` is
blocked by the permission classifier and needs your approval (you were away).
- **Option A:** authorize the push to `main` (or add a `git push origin main` permission rule) and I'll push.
- **Option B:** I create a feature branch + open a PR (not gated) for review-then-merge.
- **Recommendation:** A — matches your solo-on-main workflow. Just say "push" when you're back.

### 2. The "stops, say ok" / tool-call leak — the real fix is the chat template
Root cause (diagnosed earlier): the model emits tool calls in `<|channel|>…call:tool{…}` harmony
markup or in the reasoning channel, which **LM Studio's main agent loop doesn't parse** → it treats
the turn as a final answer → stops. The plugin only has `withToolsProvider` + `withPromptPreprocessor`
hooks; it **cannot** intercept that loop, so this is not fixable in-plugin.
- I deliberately did **not** add a prose "always use the function interface" nudge — that's exactly the
  kind of instruction a 12B ignores, and it contradicts your code-side-determinism principle.
- **Real fix to investigate:** the chat/Jinja **prompt template** for `gemma-4-12b-qat` in LM Studio.
  The `<|channel|>` markup is harmony-style; if the template doesn't match how this model was trained
  to emit tool calls, calls leak as text. Check for an updated GGUF/template, or whether LM Studio lets
  you pick the tool-call parser format for this model.
- **Decision:** is chasing the template worth it, or do you accept occasional "ok" nudges? I can't move
  this further from inside the plugin.

### 3. DuckDuckGo snippet selector — needs one real run to finalize
The empty snippets in your trace mean DDG's markup changed. I shipped a tolerant selector
(`class="…result__snippet…"`) covering the likely multi-class cause, **plus instrumentation**: if a
search returns results but zero snippets, a 500-char raw markup sample is logged into
`meta.trace` (look for `[ddg-parse]`).
- **Decision/action:** run one real `web_search`. If snippets are populated, done. If still empty,
  paste me the `[ddg-parse]` trace line and I'll fix the selector exactly. (Fallback if it stays
  broken: reorder the provider chain to try `duckduckgo-api` — which returns descriptions — before
  `duckduckgo-fetch`.)

### 4. Secondary-agent feature — still a removal candidate
Off by default, low value on a local 12B (you chose "keep dormant" earlier). Two leftovers if you ever
revisit: the sub-agent loop's `fetch_web_content` (toolsProvider ~3091) returns raw HTML truncated to
5k with no UA, and its fetches don't use `WEB_FETCH_HEADERS`. Not worth fixing while the feature is
off; clean removal is a multi-file refactor — say the word and I'll scope it.

### 5. Tool-schema audit (investigation)
The `web_search` single-string-vs-array mismatch was one case where the 12B's natural call shape
didn't match our schema. There may be others (params the model passes as arrays, or under alternate
names). Worth a systematic pass over every tool schema vs. how the model actually calls it (mine the
routing log / transcripts). I didn't do this blind — it needs evidence. Say the word.

### 6. Cosmetic (low priority, not done)
The model reprints "Using <workflow> —" on each turn segment. Harmless; skipped.
