---
name: debugging
description: Use when something is buggy or wrong — a bug, test failure, crash, error, or code that produces the WRONG result / incorrect output — and you need to find the root cause before proposing fixes
announce: Systematic Debugging
priority: 20
triggers:
  - "\\bbug\\b"
  - "test(s)? (is|are )?failing"
  - "not working"
  - "unexpected (behavior|behaviour|output|result)"
  - "\\bcrash(es|ing|ed)?\\b"
  - "throw(s|ing)? (an )?error"
  - "doesn'?t work"
  - "\\bbroke(n)?\\b"
  - "\\bregression\\b"
  - "stack ?trace"
  - "figure out (why|what'?s (wrong|going on|happening)|the (cause|problem|issue|reason))"
  - "(wrong|incorrect|bad) (value|result|output|answer|total|number|amount|count|data)"
  - "comes out (wrong|incorrect)"
examples:
  - "there is a bug in the login flow"
  - "the tests are failing"
  - "this function throws an error"
  - "the build is broken"
  - "the total comes out wrong when a discount is applied — figure out why"
---

Before doing anything else — including any tool call — output the line: "Using Systematic Debugging —". Then proceed.

The Iron Law: **NO fixes without root cause investigation first.**
- **Phase 1 — Reproduce before you theorize:** Before proposing ANY cause or fix, you MUST run the failing command/tests (e.g. `run_test_command`) and see the ACTUAL error output — never theorize from reading source code alone. A quick orientation (listing files to find the test command) is fine, but reproducing the real error must come before any hypothesis. Then read the error fully, confirm it reproduces consistently, and check recent changes.
  - **Multi-component systems (CI → build → sign, API → service → DB):** Add diagnostic instrumentation at EACH component boundary BEFORE proposing fixes — log what data enters and exits each layer, run once to identify WHERE it breaks, then investigate that specific layer only.
- **Phase 2 — Pattern:** Find working examples in the codebase. Identify exactly what is different.
- **Phase 3 — Hypothesis:** State one specific theory ("X fails because Y"). Make the smallest possible change to test it. One variable at a time.
- **Phase 4 — Fix:** Write a failing test first. Fix the root cause. Verify tests pass.
If 3+ fix attempts have failed: **STOP — do NOT attempt fix #4 without discussing the approach.** Each fix revealing a new problem in a different place = wrong architecture, not a new bug.
**Stop-signals — if you catch yourself thinking these, return to Phase 1:**
- "Just try X and see if it works" — propose and verify a hypothesis first
- "It's probably X" — verify before fixing
- "One more fix attempt" after 2+ failures — question the architecture instead
