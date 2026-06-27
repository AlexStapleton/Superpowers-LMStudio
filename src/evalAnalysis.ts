/**
 * Behavioral eval analysis (backlog B1). PURE — no I/O, unit-tested in CI.
 *
 * Given a recorded model `Trajectory` (final text + ordered tool calls), run the checks an
 * `EvalCase` declares and score them. `firstStep` checks are SOFT adherence heuristics: coarse
 * string/order signals, a starting point — not ground truth.
 */

export interface ToolCall {
  name: string;
  args: Record<string, any>;
}
export interface Trajectory {
  finalText: string;
  toolCalls: ToolCall[];
}
export interface EvalCase {
  id: string;
  prompt: string;
  mode: "tool" | "router";
  workflow: string | null;
  announce?: string;
  checks: string[];
}
export interface CheckResult {
  name: string;
  pass: boolean;
  soft?: boolean;
  detail?: string;
}
export interface CaseResult {
  id: string;
  workflow: string | null;
  mode: string;
  checks: CheckResult[];
  hardPass: boolean;
}
export interface EvalSummary {
  total: number;
  hardPass: number;
  announceRate: number;
  toolInvocationRate: number;
  firstStepRate: number;
  byWorkflow: Record<string, { total: number; hardPass: number }>;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function checkAnnounce(finalText: string, announce: string | undefined): CheckResult {
  const label = announce ?? "";
  const re = new RegExp(`Using\\s+${escapeRegex(label)}\\s+[—-]`, "i");
  const pass = label.length > 0 && re.test(finalText);
  return { name: "announce", pass, detail: pass ? undefined : `expected "Using ${label} —"` };
}

export function checkToolInvoked(toolCalls: ToolCall[], workflow: string | null): CheckResult {
  const pass = toolCalls.some(c => c.name === "use_workflow" && c.args?.workflow === workflow);
  return { name: "toolInvoked", pass, detail: pass ? undefined : `no use_workflow(${workflow}) call` };
}

export function checkNoWorkflow(toolCalls: ToolCall[], finalText: string): CheckResult {
  const calledTool = toolCalls.some(c => c.name === "use_workflow");
  const announced = /Using .+ [—-]/.test(finalText);
  const pass = !calledTool && !announced;
  return { name: "noWorkflow", pass, detail: pass ? undefined : "a workflow was loaded/announced on a benign prompt" };
}

export function checkFirstStep(workflow: string | null, finalText: string): CheckResult {
  const text = finalText.toLowerCase();
  const base = { name: "firstStep", soft: true } as const;

  if (workflow === "tdd") {
    // Require an actual test-writing intent — not the bare word "test", which also appears in the
    // "Using Test-Driven Development —" announce line.
    const intent = finalText.match(/failing test|write (a |the )?test|test first|add (a |the )?test|start (with|by writing) (a )?test|a test that/i);
    if (!intent || intent.index === undefined) {
      return { ...base, pass: false, detail: "no test proposed before implementation" };
    }
    const testIdx = intent.index;
    const fenceIdx = text.indexOf("```");
    const implIdx = text.indexOf("implement");
    const codeIdx = [fenceIdx, implIdx].filter(i => i >= 0).sort((a, b) => a - b)[0] ?? -1;
    const pass = codeIdx < 0 || testIdx < codeIdx;
    return { ...base, pass, detail: pass ? undefined : "implementation precedes the test" };
  }

  if (workflow === "brainstorming") {
    const bigCode = /```[\s\S]{40,}```/.test(finalText);
    const explores = finalText.includes("?") || /approach|option|trade-?off/i.test(finalText);
    const pass = !bigCode && explores;
    return { ...base, pass, detail: pass ? undefined : "dumped code or did not explore before design" };
  }

  if (workflow === "debugging") {
    const pass = /root cause|reproduc|investigat|\bwhy\b|diagnos/i.test(finalText);
    return { ...base, pass, detail: pass ? undefined : "no investigation before fixing" };
  }

  return { ...base, pass: true, detail: "no heuristic" };
}

export function scoreCase(c: EvalCase, traj: Trajectory): CaseResult {
  const checks: CheckResult[] = c.checks.map(name => {
    switch (name) {
      case "announce": return checkAnnounce(traj.finalText, c.announce);
      case "toolInvoked": return checkToolInvoked(traj.toolCalls, c.workflow);
      case "noWorkflow": return checkNoWorkflow(traj.toolCalls, traj.finalText);
      case "firstStep": return checkFirstStep(c.workflow, traj.finalText);
      default: return { name, pass: false, detail: "unknown check" };
    }
  });
  const hardPass = checks.filter(k => !k.soft).every(k => k.pass);
  return { id: c.id, workflow: c.workflow, mode: c.mode, checks, hardPass };
}

export function summarize(results: CaseResult[]): EvalSummary {
  const rate = (num: number, den: number) => (den === 0 ? 0 : num / den);

  let announceTotal = 0, announcePass = 0;
  let toolTotal = 0, toolPass = 0;
  let firstTotal = 0, firstPass = 0;
  const byWorkflow: Record<string, { total: number; hardPass: number }> = {};

  for (const r of results) {
    const key = r.workflow ?? "benign";
    byWorkflow[key] = byWorkflow[key] ?? { total: 0, hardPass: 0 };
    byWorkflow[key].total++;
    if (r.hardPass) byWorkflow[key].hardPass++;

    for (const c of r.checks) {
      if (c.name === "announce") { announceTotal++; if (c.pass) announcePass++; }
      if (c.name === "toolInvoked" && r.mode === "tool") { toolTotal++; if (c.pass) toolPass++; }
      if (c.name === "firstStep") { firstTotal++; if (c.pass) firstPass++; }
    }
  }

  return {
    total: results.length,
    hardPass: results.filter(r => r.hardPass).length,
    announceRate: rate(announcePass, announceTotal),
    toolInvocationRate: rate(toolPass, toolTotal),
    firstStepRate: rate(firstPass, firstTotal),
    byWorkflow,
  };
}
