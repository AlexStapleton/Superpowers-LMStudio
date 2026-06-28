---
name: requesting-code-review
description: Use to get completed code reviewed for correctness, bugs, and quality by a reviewer before merging
announce: Requesting Code Review
triggers:
  - "review (my|this|the|our) (code|change|changes|pr|implementation|diff|work)"
  - "can you (do |run |perform )?review"
  - "(do|run|perform|request) (a )?(code )?review"
examples:
  - "can you review my code"
  - "please do a code review of this PR"
---

Before doing anything else — including any tool call — output the line: "Using Requesting Code Review —". Then proceed.

1. **Get commit range** — use `git_diff` or `execute_command("git log --oneline -5")` to identify the commits in scope
2. **Dispatch reviewer** — call `consult_secondary_agent` with: (a) brief description of what was built, (b) the plan or requirements it must meet, (c) the diff or changed file contents
3. **Triage feedback by severity:**
   - **Critical** — fix immediately, do not proceed until resolved
   - **Important** — fix before merging
   - **Minor** — note for later, may proceed
4. **Push back** with specific technical reasoning if a review comment is wrong — do not blindly accept
**When to request review:**
- After each task in subagent-driven development (mandatory)
- Before merging any branch to main
- When stuck — a fresh perspective often unblocks
Never skip because "it's simple." Never ignore Critical issues. Never proceed with unfixed Important issues.
