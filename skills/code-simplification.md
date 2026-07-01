---
name: code-simplification
description: Use when refactoring working code for clarity without changing behavior — code that works but is harder to read, maintain, or extend than it should be (deep nesting, long functions, duplication, unclear names, over-engineering)
announce: Code Simplification
priority: 10
triggers:
  - "\\bsimplif(y|ies|ied|ication)\\b"
  - "\\brefactor(ing|ed|s)?\\b"
  - "clean(ing)? up (this|the|that|these|my) .{0,25}\\b(code|function|method|module|logic|mess|implementation|file)\\b"
  - "too (complex|complicated|convoluted|nested|verbose)|over[- ]?engineered"
  - "hard(er)? to (read|follow|maintain|understand|extend)"
  - "\\b(reduce|cut down( on)?|get rid of|remove)\\b .{0,20}\\b(complexity|nesting|duplication|duplicate|dead code|boilerplate)\\b"
  - "make (this|the|it) .{0,25}(clearer|cleaner|simpler|more readable|easier to (read|follow|maintain))"
  - "nested (conditional|ternar|if|block|logic)|deep(ly)? nest"
examples:
  - "refactor this function without changing its behavior"
  - "this code works but it's too complex — simplify it"
  - "clean up the tangled logic in this module"
  - "this method is hard to read, make it clearer"
  - "reduce the duplication across these handlers"
---

Before doing anything else — including any tool call — output the line: "Using Code Simplification —". Then proceed.

The Iron Law: **simplification must not change behavior.** The goal is not fewer lines — it's code a new teammate understands faster. If a "simpler" version needs a test changed to pass, you changed behavior — revert it.

- **Understand first (Chesterton's Fence):** before touching anything, know what the code does, what calls it, its edge/error paths, and why it might be written this way (`read_file_range`, check nearby tests, `git blame` for context). Don't simplify code you don't fully understand.
- **Scope to what changed:** simplify the recently-touched code only. No unscoped drive-by refactors — they create noisy diffs and hide regressions.
- **Follow project conventions:** match existing naming, imports, error handling, types. Don't rename things to your taste (see `code-conventions`).
- **One change at a time:** apply a single simplification, run the tests, repeat. Keep refactoring commits separate from feature/bugfix commits. Run tests with `run_test_command` and show the output.

**What to look for:** deep nesting (3+ levels) → early returns/guard clauses • long functions (50+ lines) → extract • nested ternaries → if/else • boolean flag params → split functions • generic/misleading names (`data`, `result`) → intent-revealing names • duplicated logic → consolidate • dead code & speculative abstractions → delete.

**Common rationalizations — all mean: stop and reconsider:**
| Excuse | Reality |
|--------|---------|
| "Fewer lines is always simpler" | A 1-line nested ternary is not simpler than a 5-line if/else. Simplicity = comprehension speed, not line count. |
| "I'll simplify this unrelated code too" | Unscoped edits create noisy diffs and risk regressions in code you didn't mean to touch. Stay in scope. |
| "This abstraction might be useful later" | Unused abstraction is complexity without value. Delete it; add it when actually needed. |
| "I'll refactor while adding the feature" | Mixed changes are hard to review, revert, and read in history. Separate the commits. |
| "The types make it self-documenting" | Types document structure, not intent. A good name explains *why*; a type explains *what*. |

**Red flags — STOP:** a test had to change to pass (you changed behavior) • the "simpler" version is longer/harder to follow • error handling removed to "clean it up" • simplifying code you don't understand • one giant hard-to-review refactor commit • refactoring outside the task's scope unasked.

**Verification checklist — before marking simplification complete:**
- [ ] All existing tests pass WITHOUT modification
- [ ] Build clean, no new warnings; linter/formatter passes
- [ ] Behavior identical — inputs, outputs, side effects, error paths, edge cases
- [ ] Each change is a small, reviewable step; diff has no unrelated edits
- [ ] Follows project conventions; no error handling weakened; no dead code left
- [ ] A reviewer would call it a net improvement in readability
