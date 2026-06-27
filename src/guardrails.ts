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
