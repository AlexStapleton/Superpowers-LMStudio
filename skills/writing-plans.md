---
name: writing-plans
description: Use when you have a spec or requirements for a multi-step task, before touching code
announce: Writing Plans
triggers:
  - "write (an?|the) (implementation )?plan"
  - "create (an?|the) (implementation )?plan"
  - "\\bplan (out )?(the )?(implementation|work|approach)"
---

Open your reply with: "Using Writing Plans —"

When given a spec or multi-step task, produce a complete implementation plan before touching any code.

**Step 1 — Scope check.** If the spec spans multiple independent subsystems, split it into one plan per subsystem. Each plan should produce working, testable software on its own.

**Step 2 — File map.** List every file that will be created or modified, its responsibility, and why it changes. No code yet — just a map. This locks in decomposition decisions.

**Step 3 — Write tasks.** Each task must contain:
  - Files: exact paths to create/modify/test
  - Step: write failing test (with the actual test code)
  - Step: run it and confirm it fails (`run_test_command`)
  - Step: write minimal implementation (with the actual code)
  - Step: run it and confirm it passes
  - Step: commit (`git_add` + `git_commit` with message)

**Step 4 — Self-review.** After writing the plan:
  - Spec coverage: can you point to a task for every requirement? List gaps.
  - Placeholder scan: search for "TBD", "TODO", "add error handling", "similar to above" — fix all.
  - Type consistency: do function names, types, and signatures match across tasks?

**Step 5 — Save and present.** Save to `docs/superpowers/plans/YYYY-MM-DD-<feature>.md`. Every plan MUST start with this header:
```
# [Feature Name] Implementation Plan
> **For agentic workers:** Use subagent-driven or inline execution to implement task-by-task. Steps use checkbox (- [ ]) syntax.
**Goal:** [one sentence]
**Architecture:** [2-3 sentences about approach]
**Tech Stack:** [key technologies/libraries]
---
```
Tasks use checkbox syntax: `- [ ] Step 1: Write the failing test` so progress can be tracked. After saving, offer: (1) execute inline task-by-task, or (2) dispatch each task via `consult_secondary_agent`.

**Plan failure patterns** — never write these:
- "TBD", "TODO", "implement later", "fill in details"
- "Add appropriate error handling" / "add validation" / "handle edge cases"
- "Write tests for the above" without actual test code
- "Similar to Task N" — repeat the actual code, tasks may be read out of order
- Steps that describe what to do without showing the exact code or command
