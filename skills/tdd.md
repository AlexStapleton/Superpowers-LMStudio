---
name: tdd
description: Use when implementing any feature or bugfix, before writing implementation code
announce: Test-Driven Development
triggers:
  - "\\bimplement\\b"
  - "add (a |the )?(feature|function|method|endpoint|test)"
  - "write (the )?code"
  - "build (a|the|me)"
  - "create (a|the) (function|class|component|module)"
  - "fix(ing)? (the )?(feature|function)"
examples:
  - "implement a CSV parser"
  - "build a login form"
  - "add a feature flag"
---

Before doing anything else — including any tool call — output the line: "Using Test-Driven Development —". Then proceed.

**Invoke when:** Implementing any feature or bugfix, before writing implementation code.
The Iron Law: **NO production code without a failing test first.** Violating the letter of this rule is violating the spirit.
- **RED:** Write the smallest test that expresses the required behavior. Run it and confirm it FAILS — and fails for the right reason (feature missing, not a syntax error or import failure). If it passes immediately, the test is wrong.
- **GREEN:** Write the minimal code to make it pass. No extra features, no early refactoring. Run it and confirm it PASSES.
- **REFACTOR:** Clean up without adding behavior. Keep all tests green.
If you wrote code before a test: delete it and start over. No exceptions: not as "reference", not to "adapt while writing tests". Delete means delete.
Use `run_test_command` to run tests. Always show the test output.
**Common rationalizations — all mean: delete code, start over:**
| Excuse | Reality |
|--------|---------|
| "Too simple to test" | Simple code breaks. The test takes 30 seconds. |
| "I'll add tests after" | Tests that pass immediately prove nothing. |
| "I already manually tested it" | Ad-hoc ≠ systematic. No record, cannot re-run. |
| "Deleting X hours of work is wasteful" | Sunk cost. Keeping unverified code is technical debt. |
| "TDD will slow me down" | TDD is faster than debugging production. |
| "Tests after achieve the same goals" | Tests-after ask "what does this do?" Tests-first ask "what should this do?" |
**Verification Checklist — before marking work complete:**
- [ ] Every new function/method has a test
- [ ] Watched each test fail before implementing
- [ ] Each test failed for expected reason (feature missing, not a syntax error)
- [ ] Wrote minimal code to pass each test
- [ ] All tests pass
- [ ] Output pristine (no errors, warnings)
- [ ] Tests use real code (mocks only if unavoidable)
- [ ] Edge cases and errors covered
Cannot check all boxes? You skipped TDD. Start over.
