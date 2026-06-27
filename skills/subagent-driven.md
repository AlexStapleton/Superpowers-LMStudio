---
name: subagent-driven
description: Use when executing a plan with 2+ independent tasks via sub-agent dispatch
announce: Subagent-Driven Implementation
triggers:
  - "subagent.?driven"
  - "(a )?subagent per task"
  - "dispatch (a )?(fresh )?subagent (for|per) (each )?task"
examples:
  - "use subagent-driven development for this plan"
  - "dispatch a fresh subagent for each task"
---

Before doing anything else — including any tool call — output the line: "Using Subagent-Driven Implementation —". Then proceed.

Read the full plan once. Extract ALL tasks with their full text and context upfront. Then execute continuously — do NOT pause to check in between tasks. The only reasons to stop are: BLOCKED status you cannot resolve, or all tasks complete.
**Never start on main/master without explicit user consent — work on a feature branch.**
**Per task (sequential — never two implementers in parallel):**
1. **Dispatch implementer** — call `consult_secondary_agent` with: full task text (do NOT make subagent read plan file), relevant file paths, codebase context, and "follow TDD: write a failing test first, then implement"
2. **Handle implementer status:**
   - `DONE` → proceed to spec review
   - `DONE_WITH_CONCERNS` → read concerns; if about correctness/scope, address before review; if observational, note and proceed
   - `NEEDS_CONTEXT` → provide missing context, re-dispatch same task
   - `BLOCKED` → assess: if context problem re-dispatch with more context; if too large break into subtasks; if plan is wrong escalate to user. Never retry BLOCKED with no changes.
3. **Spec compliance review** — dispatch reviewer via `consult_secondary_agent`: "Does this implementation match the spec exactly? List missing requirements and any extra additions not in spec."
4. **Fix spec gaps** — if issues found, dispatch implementer again with only the specific gaps. Re-review until spec review is clean.
5. **Code quality review** — only AFTER spec compliance passes: "Review for quality: naming, duplication, unnecessary complexity, missing error handling."
6. **Fix quality issues** — re-review until approved.
7. **Mark task complete** — only after BOTH reviews are clean.
After all tasks: dispatch a final reviewer across the entire implementation, then load `use_workflow(finishing-a-branch)`.
**Red flags — STOP:**
- Dispatching two implementers in parallel
- Starting code quality review before spec compliance is clean
- Proceeding to next task while either review has open issues
- Making subagent read the plan file (provide full text instead)
