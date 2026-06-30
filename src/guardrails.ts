/**
 * TDD test-first guardrail (backlog D1). PURE — shared by the plugin's save_file tool and the eval
 * stub so the guardrail is both enforced and measurable. The judged eval showed Gemma writes
 * production code before the test ("test-after"); prose alone (the Iron Law) doesn't stop it.
 */

const TEST_PATTERNS: RegExp[] = [
  /(^|\/)tests?\//i, // inside a test/ or tests/ directory
  /__tests__\//i, // jest-style
  /\.(test|spec)\.[a-z0-9]+$/i, // foo.test.ts / foo.spec.js
  /(^|\/)test_[^/]+$/i, // test_foo.py
  /_test\.[a-z0-9]+$/i, // foo_test.go
  /(^|\/)[^/]*spec\.[a-z0-9]+$/i, // foo_spec.rb / spec.rb
];

export function isTestFile(fileName: string): boolean {
  const f = (fileName || "").replace(/\\/g, "/");
  return TEST_PATTERNS.some(re => re.test(f));
}

const CODE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|rb|c|h|cpp|hpp|cc|cs|php|swift|kt|kts|scala|m)$/i;

export function isSourceCodeFile(fileName: string): boolean {
  return CODE_EXT.test(fileName || "") && !isTestFile(fileName);
}

export type TddGuardrailMode = "off" | "warn" | "block";

/**
 * Which workflow is active for guardrail purposes. The code ROUTER auto-loads a workflow every turn
 * (persisted as `lastInjectedWorkflow`) — this is the dominant path, because a 12B rarely self-invokes
 * `use_workflow`. So the router's current injection must win; an explicit `use_workflow` call is only
 * the fallback. Without this the gate was blind to the router path and almost never fired in practice.
 */
export function resolveActiveWorkflow(routerInjected: string | null, toolInvoked: string | null): string | null {
  return routerInjected ?? toolInvoked;
}

export interface GuardrailOpts {
  active: string | null;
  testSeen: boolean;
  fileName: string;
  mode: TddGuardrailMode;
}

/**
 * Declarative workflow step-gates (B). Each row is one workflow's critical ordering invariant,
 * expressed as: "given this file write, is it out of order?" → a violation message, else null. This is
 * the deterministic mechanism for keeping the model's logical steps correct. NOTE the ceiling: the only
 * invariants enforceable in-plugin are ones gateable on a TOOL CALL — a free-text final answer has no
 * hook (that's why research's fetch-before-answer is a directive, not a row here). Add a row to extend;
 * `mode` ("warn"|"block") decides whether a violation nudges or hard-stops.
 */
// `advisory` gates only ever WARN (never hard-block), even in "block" mode — for invariants where a
// violation is usually-but-not-always wrong (e.g. a debug log edit before reproducing is legitimate).
const WORKFLOW_GATES: Array<{ workflow: string; advisory?: boolean; violation: (o: GuardrailOpts) => string | null }> = [
  {
    workflow: "tdd",
    violation: ({ testSeen, fileName }) =>
      !testSeen && isSourceCodeFile(fileName)
        ? `TDD is active and no test has been written or run yet. Per the Iron Law — no production code ` +
          `without a failing test first — write a failing test before creating source file '${fileName}'.`
        : null,
  },
  {
    workflow: "brainstorming",
    violation: ({ fileName }) =>
      isSourceCodeFile(fileName)
        ? `Brainstorming is a DESIGN phase — do not write source code ('${fileName}') before the design ` +
          `is approved. Capture the design in a doc (e.g. docs/superpowers/specs/...md) and get sign-off first.`
        : null,
  },
  {
    // Advisory: reproduce-first is the Iron Law, but an investigative edit (adding a log line) before
    // running tests is legitimate — so nudge, never block, even when the global mode is "block".
    workflow: "debugging",
    advisory: true,
    violation: ({ testSeen, fileName }) =>
      !testSeen && isSourceCodeFile(fileName)
        ? `Systematic Debugging is active but no test has been run yet. Reproduce the bug first ` +
          `(run_test_command) before editing source ('${fileName}') — fixing before reproducing is guessing.`
        : null,
  },
];

// Back-compat: the TDD gate on its own (still imported + tested directly). Delegates to the table.
export function evaluateTddGuardrail(opts: GuardrailOpts): { block: boolean; warning: string | null } {
  if (opts.active !== "tdd") return { block: false, warning: null };
  return evaluateGuardrail(opts);
}

/**
 * Fetch-before-answer guardrail (D3). A web_search returns snippets; the judged eval + a real
 * "when is the next England World Cup game" run showed a 12B answers straight from those snippets —
 * the exact failure research.md warns against ("The snippet says enough → read the full page") — and
 * often gets it wrong/stale. This is keyed on the SEARCH act (attached to the web_search tool result),
 * NOT on the research workflow being routed, so it fires even when the router never loaded research.
 * Like the other guardrails it enforces via a tool's return value — the plugin has no post-generation
 * hook to hard-block free text, so this is a deterministic directive at the search boundary.
 */
export function webSearchFetchDirective(): string {
  return (
    "MANDATORY NEXT STEP — these are search snippets, not sources. Before you answer, call " +
    "fetch_web_content(url) (or rag_web_content(url, query) for a long page) on the most relevant " +
    "result and base your answer on the page content. Do NOT answer from these snippets alone: they " +
    "are truncated and often stale. If the question is time-relative (\"next\", \"latest\", \"current\"), " +
    "anchor it to today's date stated in context."
  );
}

/**
 * General workflow code-gate (B): consults the declarative WORKFLOW_GATES table. Returns a hard block
 * (mode "block") or a non-blocking warning (mode "warn") when the active workflow's ordering invariant
 * is violated by this file write; otherwise a no-op.
 */
export function evaluateGuardrail(opts: GuardrailOpts): { block: boolean; warning: string | null } {
  if (opts.mode === "off") return { block: false, warning: null };
  const gate = WORKFLOW_GATES.find(g => g.workflow === opts.active);
  const warning = gate ? gate.violation(opts) : null;
  if (!warning) return { block: false, warning: null };
  const block = opts.mode === "block" && !gate!.advisory;
  return block ? { block: true, warning } : { block: false, warning };
}
