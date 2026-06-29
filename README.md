# Superpowers for LM Studio

An [LM Studio](https://lmstudio.ai/) plugin that gives a local model a full agentic toolset —
file system, shell, web/RAG, git & GitHub, sub-agents — and layers on a **Superpowers-style
workflow skill system** that gets even small local models (tested on **Gemma 4 12B**) to
reliably follow real engineering workflows instead of improvising.

> Based on [Beledarian's LM Studio Toolbox](https://github.com/Beledarian/Beledarians_LM_Studio_Toolbox)
> (MIT), extended with the workflow skill system described below.

---

## Why this exists

Local models are far weaker instruction-followers than frontier models. Cramming a giant
"always follow these workflows" system prompt into context doesn't work — the model reads it
once and then drifts back to direct execution.

This plugin borrows the mechanism that makes Anthropic's **Superpowers** skill system reliable
and adapts it **downward** for ~12B models:

- **Just-in-time delivery** — workflow procedures aren't all dumped up front. The relevant one
  is loaded at the moment it's needed, at the top of attention.
- **A forcing function** — a `use_workflow` tool the model calls to load a workflow. It returns
  the full procedure and instructs the model to announce `Using <workflow> —`, creating an
  observable commitment.
- **A code-side backstop** — because a 12B won't always remember to call the tool, a keyword
  router in the prompt preprocessor injects the matching workflow automatically on
  high-confidence triggers. The model doesn't have to decide; the code guarantees the right
  procedure is present.
- **One registry, many files** — each workflow is a single `skills/*.md` file. Adding one
  needs **no code change**.

## How the skill system works

1. **Dispatcher (every turn).** A compact table of available workflows plus the rule: *if the
   request matches one, call `use_workflow` first.* Small enough to re-inject every turn.
2. **`use_workflow` tool.** The model calls it with a workflow name; it returns the full
   procedure and the announcement instruction. This is the primary, model-driven path.
3. **Keyword router (backstop).** [`src/skills.ts`](src/skills.ts) matches the user's message
   against each skill's `triggers`; on a confident match the preprocessor injects that
   workflow's body directly — so the procedure is present even if the model never calls the
   tool. Benign messages (e.g. `cd`, `pwd`, "thanks") match nothing and are left alone. Toggle
   with the **Auto-load matching workflow** setting (`enableWorkflowRouter`).

All three are driven by one in-memory registry, so the dispatcher table, the tool's workflow
list, and the router triggers can never drift apart.

### Included workflows (`skills/`)

| Skill | Fires when |
|-------|------------|
| `brainstorming` | starting a new feature/component, before writing code |
| `tdd` | implementing any feature or bugfix (test-first) |
| `debugging` | a bug, test failure, or unexpected behavior |
| `verification` | before claiming work is done / fixed / passing |
| `research` | looking something up or answering external/current facts |
| `explaining-code` | asked to explain, understand, or walk through a codebase |

### Add your own workflow

Drop a Markdown file in [`skills/`](skills):

```markdown
---
name: my-workflow
description: Use when <trigger condition> — feeds the dispatcher table and tool list
announce: My Workflow
triggers:
  - "regex source one"
  - "regex source two"
---
Open your reply with: "Using My Workflow —"

...the step-by-step procedure the model should follow...
```

Restart the plugin (`lms dev`). The dispatcher table, the `use_workflow` enum, and the router
all pick it up automatically — no TypeScript changes required.

---

## Core toolset

- **File system:** read/write, ranged reads, surgical edits (`replace_text_in_file`,
  `insert_at_line`, `multi_replace_text`), search (`search_in_file`, `search_directory`,
  `find_files` (name **or glob**, e.g. `**/router*`), `fuzzy_find_local_files`),
  `get_current_directory`. Reads accept **absolute paths** and auto-root the workspace at the
  referenced project, so the model can explore it freely for context; writes stay scoped to that
  project. A code-enforced **Protected Paths** deny-list blocks secrets (`.ssh`, `.env*`, `*.pem`/
  `*.key`, cloud creds…) on every read, write, and search.
- **Execution (opt-in):** shell, interactive terminal, background commands, Python, JavaScript
  (Deno-sandboxed), test runner. All gated behind per-tool safety toggles, **off by default**.
- **Web & RAG:** `web_search`, `fetch_web_content`, `wikipedia_search`, persistent browser
  sessions, web-page RAG, and semantic search over local files.
- **Git & GitHub:** native `git_*` tools plus `gh_*` (issues, PRs, diffs, push).
- **Sub-agents:** delegate coding/research to a secondary local model, with auto-save and
  optional auto-debug; run independent tasks in parallel.
- **Utility:** memory, clipboard, system info, datetime, document parsing (PDF/DOCX),
  SQLite inspection, desktop notifications.

## Requirements

- [Node.js](https://nodejs.org/) 18+
- [LM Studio](https://lmstudio.ai/) 0.3.0+

## Development

```bash
npm install
lms dev          # run from the project dir; LM Studio hot-reloads on src/ changes
```

> **Note:** `skills/*.md` edits hot-reload — the skill cache busts on file mtime, so a changed
> skill takes effect on the next turn without restarting `lms dev`. (Adding a brand-new skill file
> the watcher hasn't seen may still need a restart.)

Run the full check suite (typecheck + build + tests):

```bash
npm run ci
```

## Configuration

In the LM Studio **Plugins** tab:

- **Execution permissions** — Allow JavaScript / Python / Shell / Terminal / Browser Control
  (all **off** by default).
- **Auto-load matching workflow** (`enableWorkflowRouter`) — the code-side router backstop
  (default **on**).
- **Plan Mode** — when the model should explore and propose a plan before changing code.
- **Allow Git Operations / GitHub CLI Tools**.
- **Secondary / sub-agent** settings — endpoint, model, permissions, profiles.
- **Protected Paths** — glob patterns the model may not read/write/search. These *add* to built-in
  defaults that already block credentials and secrets, so the broad file access stays safe by default.
- **Default Workspace Path**, memory, language, and more.

## Credits & License

This project is licensed under the **GNU General Public License v3.0** — see [`LICENSE`](LICENSE).
GPL is copyleft: derivatives that are distributed must also be GPL with source available, so the
plugin and anything built on it stay free for everyone downstream.

It is a derivative of **[Beledarian's LM Studio Toolbox](https://github.com/Beledarian/Beledarians_LM_Studio_Toolbox)**
(© 2025 Laurin Feulner, MIT) — the underlying tool suite and sub-agent system. MIT permits
relicensing the combined work under GPL; the required upstream MIT notice is preserved in
[`NOTICE`](NOTICE). The workflow skill system (`skills/`, `src/skills.ts`, the `use_workflow`
tool, and the dispatcher/router in the prompt preprocessor) was added in this fork.
