---
name: parallel-dispatch
description: Use when facing 2+ independent problems or tasks that share no state
announce: Parallel Agent Dispatch
triggers:
  - "in parallel"
  - "(multiple|several) (independent|unrelated) (bugs|tasks|issues|problems)"
  - "at the same time .{0,20}(tasks|bugs|fixes)"
examples:
  - "fix these multiple independent bugs"
  - "run these tasks in parallel"
---

Before doing anything else — including any tool call — output the line: "Using Parallel Agent Dispatch —". Then proceed.

You have 2+ independent tasks (different subsystems, unrelated bugs). Your job is to FAN THEM OUT, not to do them yourself.
1. **Immediately call `dispatch_parallel_agents`** with one task per independent unit of work — they all run at once. Do NOT read files, explore, or start fixing anything yourself first; each sub-agent does its own exploration. (Use `consult_secondary_agent` only for a single task.)
2. Make each task self-contained — the sub-agent has NO conversation history. Give it: exact scope, file paths, the error/requirement verbatim, constraints, and the output you want back.
3. When results return, aggregate them, verify each independently (load `use_workflow(verification)`), then report back.
Do NOT dispatch parallel agents when the failures are related, or when two agents would write the same files.
**Red flags — STOP:**
- Doing the tasks yourself sequentially instead of dispatching — that defeats the whole skill
- Exploring or reading the codebase before dispatching — the sub-agents do that
- Handing one agent a vague "fix everything" task
**Good vs bad agent prompts:**
- ❌ Too broad: "Fix all the tests" — agent gets lost
- ✅ Focused: "Fix the 3 failing tests in `src/auth/login.test.ts`" — narrow scope
- ❌ No context: "Fix the race condition" — agent does not know where to look
- ✅ Self-contained: paste the exact error messages and test names
- ❌ No constraints: agent may refactor unrelated code
- ✅ Explicit constraints: "Do NOT change production code outside of `src/auth/`"
- ❌ Vague output: "Fix it" — you cannot verify what changed
- ✅ Specific output: "Return a summary of root cause and each file changed"
