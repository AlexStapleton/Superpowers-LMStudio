---
name: brainstorming
description: Use before any new feature, component, or behavior change, before touching code
announce: Brainstorming
triggers:
  - "new feature"
  - "let'?s (build|make|create|add)"
  - "i want (to build|to make|a)"
  - "design (a|the|me)"
  - "build me"
  - "add (support for|the ability)"
---

Open your reply with: "Using Brainstorming —"

**Invoke when:** Starting any new feature, component, or behavior change before touching code.
Before writing any code for a new feature, component, or behavior change:
**HARD GATE:** Do NOT write any code until the user has approved a design. No exceptions — not even for "simple" tasks. A simple design can be a few sentences; the gate still applies.
1. **Explore context** — read relevant files, check existing patterns with `search_directory`. If the request spans multiple independent subsystems (e.g., "add auth, file storage, and billing"), flag it immediately and help the user decompose into sub-projects before going further. Each sub-project gets its own brainstorm → spec → plan → implementation cycle.
2. **State assumptions** — list what you believe is true about the codebase that affects this feature
3. **Ask clarifying questions** — one at a time: purpose, constraints, success criteria. Prefer multiple-choice questions when possible.
4. **Propose 2-3 approaches** with trade-offs and your recommendation
5. **Present design in sections** — present one section at a time and ask "does this look right?" after EACH section before moving on. Do NOT present the full design and ask for approval at the end. Sections: architecture, components, data flow, error handling, testing.
6. **Write design doc** — once the user approves the design, save it to `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md` and commit it. Then run the spec self-review inline:
   - Placeholder scan: any "TBD", "TODO", vague requirements? Fix them.
   - Internal consistency: do sections contradict each other? Does the architecture match feature descriptions?
   - Scope check: focused enough for one implementation plan, or needs decomposition?
   - Ambiguity check: any requirement interpretable two ways? Pick one and make it explicit.
7. **User reviews spec** — present the committed spec path and ask: "Please review it and let me know if you want any changes before I write the implementation plan." Wait for approval.
8. When the design is approved, write the implementation plan inline to docs/superpowers/plans/YYYY-MM-DD-<topic>.md. Do NOT call use_workflow(writing_plans); that workflow is not yet available.
**YAGNI ruthlessly:** Remove unnecessary features from every design. If it is not in the requirements, do not add it.
