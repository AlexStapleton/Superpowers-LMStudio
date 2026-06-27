---
name: debugging
description: Use when encountering any bug, test failure, or unexpected behavior, before proposing fixes
announce: Systematic Debugging
triggers:
  - "\\bbug\\b"
  - "test(s)? (is|are )?failing"
  - "not working"
  - "unexpected (behavior|behaviour|output|result)"
  - "\\bcrash(es|ing|ed)?\\b"
  - "throw(s|ing)? (an )?error"
  - "doesn'?t work"
examples:
  - "there is a bug in the login flow"
  - "the tests are failing"
  - "this function throws an error"
---

Before doing anything else — including any tool call — output the line: "Using Systematic Debugging —". Then proceed.

The Iron Law: **NO fixes without root cause investigation first.**
- **Phase 1 — Root cause:** Read error messages fully. Reproduce consistently. Check recent changes.
  - **Multi-component systems (CI → build → sign, API → service → DB):** Add diagnostic instrumentation at EACH component boundary BEFORE proposing fixes — log what data enters and exits each layer, run once to identify WHERE it breaks, then investigate that specific layer only.
- **Phase 2 — Pattern:** Find working examples in the codebase. Identify exactly what is different.
- **Phase 3 — Hypothesis:** State one specific theory ("X fails because Y"). Make the smallest possible change to test it. One variable at a time.
- **Phase 4 — Fix:** Write a failing test first. Fix the root cause. Verify tests pass.
If 3+ fix attempts have failed: **STOP — do NOT attempt fix #4 without discussing the approach.** Each fix revealing a new problem in a different place = wrong architecture, not a new bug.
**Stop-signals — if you catch yourself thinking these, return to Phase 1:**
- "Just try X and see if it works" — propose and verify a hypothesis first
- "It's probably X" — verify before fixing
- "One more fix attempt" after 2+ failures — question the architecture instead
