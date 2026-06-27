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

Open your reply with: "Using Parallel Agent Dispatch —"

When facing multiple independent tasks (different subsystems, different bugs with unrelated root causes):
1. Group work into independent domains — each domain has no shared state with the others
2. **Call `dispatch_parallel_agents` with an array of tasks** — all run simultaneously. Use `consult_secondary_agent` only when running a single task.
3. Aggregate results, verify each independently (load `use_workflow(verification)`), then report back
Do NOT dispatch parallel agents when failures are related, or when agents would write to the same files.
**Good vs bad agent prompts:**
- ❌ Too broad: "Fix all the tests" — agent gets lost
- ✅ Focused: "Fix the 3 failing tests in `src/auth/login.test.ts`" — narrow scope
- ❌ No context: "Fix the race condition" — agent does not know where to look
- ✅ Self-contained: paste the exact error messages and test names
- ❌ No constraints: agent may refactor unrelated code
- ✅ Explicit constraints: "Do NOT change production code outside of `src/auth/`"
- ❌ Vague output: "Fix it" — you cannot verify what changed
- ✅ Specific output: "Return a summary of root cause and each file changed"
