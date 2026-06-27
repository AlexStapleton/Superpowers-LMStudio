---
name: receiving-code-review
description: Use when receiving code review feedback, before implementing the suggestions
announce: Receiving Code Review
triggers:
  - "here ?(is|'?s) (the|my|some|a) (code )?review"
  - "got (the|my|some|a) (code )?review"
  - "review (feedback|comments)"
  - "address (the|this|these) (review|feedback|comments)"
  - "the reviewer (said|noted|wants)"
---

Open your reply with: "Using Receiving Code Review —"

When receiving review feedback:
1. Read ALL feedback before acting on any of it
2. If anything is unclear, ask for clarification BEFORE implementing anything
3. For each suggestion: verify it is technically correct for this codebase before applying
4. Push back with technical reasoning if a suggestion is wrong — do not blindly implement
Never: "You're absolutely right!", "Great point!" — just restate the requirement and act.
