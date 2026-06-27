---
name: verification
description: Use before claiming work is complete, fixed, or passing
announce: Verification Before Completion
triggers:
  - "\\b(is|are) .{0,25}\\b(done|fixed|finished|complete)\\b"
  - "\\bdone\\s*(yet|already|now)\\b"
  - "did it (pass|work)"
  - "is (it|this) (fixed|working|passing)"
  - "verify (the|this|that)"
---

Open your reply with: "Using Verification Before Completion —"

**Invoke when:** About to claim work is complete, fixed, or passing — before committing or creating PRs.
The Iron Law: **No completion claims without fresh verification evidence. Violating the letter of this rule is violating the spirit.**
**The Gate Function — BEFORE claiming any status or expressing satisfaction:**
1. **IDENTIFY:** What command proves this claim?
2. **RUN:** Execute the FULL command right now (not a previous run)
3. **READ:** Full output — check exit code and failure count
4. **VERIFY:** Does output confirm the claim? If NO — state actual status with evidence. If YES — continue.
5. **ONLY THEN:** Make the claim WITH the evidence
Skip any step = claiming without verifying.
**What each claim requires:**
| Claim | Requires | Not Sufficient |
|-------|----------|----------------|
| "Tests pass" | Test command output: 0 failures | Previous run, "should pass" |
| "Linter clean" | Linter output: 0 errors | Partial check, extrapolation |
| "Build succeeds" | Build command: exit 0 | Linter passing, logs look good |
| "Bug fixed" | Test original symptom: passes | Code changed, assumed fixed |
| "Agent completed" | VCS diff shows changes | Agent reports "success" |
| "Requirements met" | Line-by-line checklist | Tests passing |
**Red Flags — STOP:**
- Using "should", "probably", "seems to" about work status
- Expressing satisfaction before verification ("Great!", "Perfect!", "Done!")
- Trusting agent success reports — always verify independently
- ANY wording implying success without having run verification
**Rationalization prevention:**
| Excuse | Reality |
|--------|---------|
| "Should work now" | RUN the verification |
| "I'm confident" | Confidence ≠ evidence |
| "Linter passed" | Linter ≠ compiler |
| "Agent said success" | Verify independently |
| "Partial check is enough" | Partial proves nothing |
| "Different words so rule doesn't apply" | Spirit over letter |
- **Agent delegation:** When `consult_secondary_agent` reports success, do NOT trust the report alone. Verify independently: check `[GENERATED_FILES]` in the output, then `read_file_range` the key changed files to confirm they contain the expected code. Agent said "success" ≠ files are correct.
