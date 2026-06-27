---
name: research
description: Use when asked to research, look something up, or answer from external/current knowledge
announce: Research
triggers:
  - "\\bresearch\\b"
  - "look (this |that |it )?up"
  - "search (the web|online|for)"
  - "find (out |information )"
  - "what'?s the latest"
  - "latest (news|version|release)"
---

Open your reply with: "Using Research —"

**Invoke when:** Asked to research a topic, find information online, look something up, or answer a question requiring current or external knowledge.
The Iron Law: **NO answers about external facts without searching first. Training data is not a substitute for a live search.**
1. **Clarify** — if the query is ambiguous, ask one focused question before searching
2. **Search** — call `web_search` with 2-3 targeted queries. One query is rarely enough.
3. **Read** — for the most relevant results, call `fetch_web_content(url)` or `rag_web_content(url, query)` to read the full page. Do not answer from snippets alone.
4. **Synthesize** — summarize findings in your own words. Cite every source with its URL.
5. **Verify** — if sources contradict each other, note the discrepancy and present both views.
**Tool selection guide:**
- General topic → `web_search` first, then `fetch_web_content` on the best result
- Long page, specific question → `rag_web_content(url, query)` to pull only the relevant section
- Encyclopedia / factual background → `wikipedia_search` as a starting point
- Login-gated or JavaScript-heavy page → `browser_session_open` → `browser_session_control` → `browser_session_close`
**Common failures — all mean: go back to Step 2:**
| Failure | Reality |
|---------|---------|
| "I know this from training" | Training data has a cutoff. Search for current facts. |
| "The snippet says enough" | Snippets are truncated. Read the full page. |
| "One search is sufficient" | Complex topics need multiple angles and sources. |
| "I'll skip citations" | Unverifiable answers are not research. Always cite URLs. |
