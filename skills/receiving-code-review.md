---
name: receiving-code-review
description: Use when you have ALREADY received code-review feedback — reviewer notes, PR comments, suggestions — and need to work through and address them. The responding side, not requesting a review.
announce: Receiving Code Review
priority: 10
triggers:
  - "here ?(is|'?s) (the|my|some|a) (code )?review"
  - "got (the|my|some|a) (code )?review"
  - "review (feedback|comments)"
  - "address (the|this|these) (review|feedback|comments)"
  - "the reviewer (said|noted|wants|left|gave)"
  - "(notes|comments|feedback) on (my|the|this) (pr|code|change|diff|branch)"
  - "work through (the|these|my|all|each) (notes|comments|feedback|review|suggestions|points)"
  - "left .{0,20}(notes|comments|feedback)"
examples:
  - "here is the code review from my colleague"
  - "address this feedback"
  - "the reviewer left a bunch of notes on my PR — help me work through them"
---

Before doing anything else — including any tool call — output the line: "Using Receiving Code Review —". Then proceed.

When receiving review feedback:
1. Read ALL feedback before acting on any of it
2. If anything is unclear, ask for clarification BEFORE implementing anything
3. For each suggestion: verify it is technically correct for this codebase before applying
4. Push back with technical reasoning if a suggestion is wrong — do not blindly implement
Never: "You're absolutely right!", "Great point!" — just restate the requirement and act.
