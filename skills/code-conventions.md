---
name: code-conventions
description: Use before writing new code in an existing codebase, to match established patterns
announce: Code Conventions Check
triggers:
  - "match (the )?(existing )?(code )?(conventions|style|patterns)"
  - "follow (the )?(existing )?(code )?(conventions|style|patterns)"
---

Open your reply with: "Using Code Conventions Check —"

Before writing any new code in an existing codebase:
1. Read 2–3 nearby files in the same directory or module (`read_file_range`, `search_in_file`)
2. Note the project's established patterns: naming style (camelCase vs snake_case), error handling, import order, type annotations, file structure
3. Match those patterns exactly in new code — do NOT introduce new conventions when established ones exist
If two conflicting patterns exist, pick the majority pattern and note the inconsistency in a brief comment.
