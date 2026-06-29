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

export function evaluateTddGuardrail(opts: {
  active: string | null;
  testSeen: boolean;
  fileName: string;
  mode: TddGuardrailMode;
}): { block: boolean; warning: string | null } {
  const { active, testSeen, fileName, mode } = opts;
  if (mode === "off" || active !== "tdd" || testSeen || !isSourceCodeFile(fileName)) {
    return { block: false, warning: null };
  }
  const warning =
    `TDD is active and no test has been written or run yet. Per the Iron Law — no production code ` +
    `without a failing test first — write a failing test before creating source file '${fileName}'.`;
  return mode === "block" ? { block: true, warning } : { block: false, warning };
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
 * General workflow code-gate (DoD2): dispatches by active workflow.
 *  - tdd: no production code before a test (see evaluateTddGuardrail).
 *  - brainstorming: no source code at all — it's a DESIGN phase; design docs (.md) are fine.
 */
export function evaluateGuardrail(opts: {
  active: string | null;
  testSeen: boolean;
  fileName: string;
  mode: TddGuardrailMode;
}): { block: boolean; warning: string | null } {
  if (opts.mode === "off") return { block: false, warning: null };
  if (opts.active === "tdd") return evaluateTddGuardrail(opts);
  if (opts.active === "brainstorming" && isSourceCodeFile(opts.fileName)) {
    const warning =
      `Brainstorming is a DESIGN phase — do not write source code ('${opts.fileName}') before the design ` +
      `is approved. Capture the design in a doc (e.g. docs/superpowers/specs/...md) and get sign-off first.`;
    return opts.mode === "block" ? { block: true, warning } : { block: false, warning };
  }
  return { block: false, warning: null };
}
