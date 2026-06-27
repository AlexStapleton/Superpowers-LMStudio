---
name: explaining-code
description: Use when asked to explain, understand, or walk through code or a project you have file access to
announce: Code Explanation
triggers:
  - "explain .{0,25}\\b(code|file|function|class|method|project|codebase|repo|repository|module|script|app|component)\\b"
  - "what does (this|the|it|that) .{0,30}\\b(do|mean)\\b"
  - "how does (this|the|it|that) .{0,30}work"
  - "walk me through"
  - "understand .{0,20}\\b(code|codebase|project|file|repo|app)\\b"
  - "what is this (code|project|repo|codebase|app)"
examples:
  - "explain to me this code"
  - "what does this function do"
  - "walk me through the auth flow"
---

Before doing anything else — including any tool call — output the line: "Using Code Explanation —". Then proceed.

You have file-system access. **NEVER ask the user to paste code you can read yourself.** Asking "please provide the code snippet" when you are sitting in a project directory is a failure — read the files.

When asked to explain code in the current directory:
1. **Orient** — `list_directory`, then read the entry points: `README.md`, `package.json` (scripts + dependencies tell you the purpose and stack), and the main entry (`src/index.*`, `src/main.*`, `app.*`, or whatever the package config points to). Establish what the project IS and what stack it uses.
2. **Map** — use `search_directory` / `list_directory` to find the key modules. Read the most important files with `read_file_range` (target the relevant ranges — do NOT dump entire large files).
3. **Explain top-down** — lead with what the project does and its overall architecture, then the main execution flow, then the notable components. Reference concrete `file:line` locations so the user can follow along.
4. **Offer depth** — end by offering to go deeper on a specific file, function, or flow.

Only ask a clarifying question if the directory genuinely contains multiple unrelated projects and you cannot tell which one is meant — and even then, name the candidate projects/entry points you actually found rather than asking the user to paste code.
