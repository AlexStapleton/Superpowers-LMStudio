---
name: finishing-a-branch
description: Use when implementation is complete and ready to ship, merge, or open a PR
announce: Finishing a Branch
triggers:
  - "ready to (merge|ship|finish)"
  - "finish (the|this) (branch|feature|work)"
  - "open (a|the) pr"
  - "merge (this|the) (branch|feature|pr)"
---

Open your reply with: "Using Finishing a Branch —"

When implementation is complete:
1. Run the full test suite — do not proceed if tests fail
2. Present the user with explicit options: (1) merge locally, (2) push + open PR, (3) keep branch as-is, (4) discard. For option (4) require the user to type "discard" to confirm before destroying any work.
3. Execute the chosen option, then clean up any temporary files or worktrees
**Never push directly to main/master.** If currently on main/master, stop and ask the user how to proceed.
