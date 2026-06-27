---
name: executing-a-plan
description: Use when given a written plan file to execute
announce: Executing a Written Plan
triggers:
  - "execute (the|this|my) plan"
  - "run (the|this) plan"
  - "implement (the|this) plan"
  - "follow (the|this) plan"
  - "start (on |with )?(the|this) plan"
examples:
  - "execute the plan"
  - "follow the plan in docs/plans"
  - "start on the plan"
---

Open your reply with: "Using Executing a Written Plan —"

**Never start implementation on main/master branch without explicit user consent — confirm branch first.**
When given a written implementation plan (saved in `docs/superpowers/plans/`):
1. **Load and review** — read the plan file, identify any ambiguities or concerns before starting. Raise concerns with the user before touching any code.
2. **Task list** — extract each task and note its verification step
3. **Execute task-by-task:**
   - Mark task in-progress before touching any files
   - Follow every step exactly as written — do not improvise or skip
   - Run the specified verification (test, build, lint) using `run_test_command`
   - Only mark task complete after verification passes
4. **STOP immediately** when: a step is unclear, a dependency is missing, verification fails 3+ times, or you hit a blocker you cannot resolve. Ask for clarification — do not guess or force through.
Never: skip steps, guess at unclear instructions, proceed on a blocked task, or claim complete without running verification.
