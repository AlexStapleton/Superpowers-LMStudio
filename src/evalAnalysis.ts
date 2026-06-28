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
  /** Outcome tag: "ok" | "BLOCKED" | "error" — a blocked/errored call did not actually execute. */
  status?: string;
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
  /** True when the check could not be evaluated (e.g. judge timeout) — exclude from rates. */
  errored?: boolean;
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
  workflowLoadedRate: number;
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
  // Soft/informational: in the realistic (router-on) plugin, the router can load the workflow even
  // when the model never self-invokes the tool — so self-invocation is a signal, not a requirement.
  return { name: "toolInvoked", pass, soft: true, detail: pass ? undefined : `no use_workflow(${workflow}) call` };
}

// Did the agent delegate to a sub-agent (consult_secondary_agent)? Soft/informational signal for the
// sub-agent orchestration workflows — the judge grades whether the delegation was done WELL.
export function checkDelegated(toolCalls: ToolCall[]): CheckResult {
  const pass = toolCalls.some(c => c.name === "consult_secondary_agent");
  return { name: "delegated", pass, soft: true, detail: pass ? undefined : "no consult_secondary_agent call" };
}

// Realistic mode: did the workflow load by EITHER path — the code router matching the prompt, or the
// model calling use_workflow? This is the metric that reflects the actual hybrid plugin.
export function checkWorkflowLoaded(
  toolCalls: ToolCall[],
  workflow: string | null,
  routerMatched: string | null | undefined,
): CheckResult {
  const viaTool = toolCalls.some(c => c.name === "use_workflow" && c.args?.workflow === workflow);
  const viaRouter = !!workflow && routerMatched === workflow;
  const pass = viaTool || viaRouter;
  return { name: "workflowLoaded", pass, detail: viaRouter ? "via router" : viaTool ? "via tool" : "NOT loaded" };
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

export function scoreCase(
  c: EvalCase,
  traj: Trajectory,
  adherence?: { pass: boolean; reason?: string; error?: boolean },
  opts: { routerMatched?: string | null } = {},
): CaseResult {
  // The plugin surfaces "Using X —" itself via a status block on BOTH load paths — the router
  // auto-load (createStatus in the preprocessor) and the model self-invoking use_workflow (ctx.status
  // in the tool). So whenever the correct workflow was loaded by code, the announce is guaranteed
  // regardless of whether the model narrates it. Only a case where neither happened depends on the
  // model's text. This keeps the eval faithful to real plugin behavior.
  const selfInvoked = traj.toolCalls.some(t => t.name === "use_workflow" && t.args?.workflow === c.workflow);
  const announceCodeGuaranteed = !!c.announce && (opts.routerMatched === c.workflow || selfInvoked);
  const checks: CheckResult[] = c.checks.map(name => {
    switch (name) {
      case "announce":
        return announceCodeGuaranteed
          ? { name: "announce", pass: true, detail: "code-surfaced via status (router auto-load)" }
          : checkAnnounce(traj.finalText, c.announce);
      case "toolInvoked": return checkToolInvoked(traj.toolCalls, c.workflow);
      case "delegated": return checkDelegated(traj.toolCalls);
      case "workflowLoaded": return checkWorkflowLoaded(traj.toolCalls, c.workflow, opts.routerMatched);
      case "noWorkflow": return checkNoWorkflow(traj.toolCalls, traj.finalText);
      case "firstStep": return checkFirstStep(c.workflow, traj.finalText);
      case "adherence":
        return adherence
          ? { name: "adherence", pass: adherence.pass, soft: true, errored: adherence.error, detail: adherence.reason }
          : { name: "adherence", pass: true, soft: true, detail: "no judge" };
      default: return { name, pass: false, detail: "unknown check" };
    }
  });
  const hardPass = checks.filter(k => !k.soft).every(k => k.pass);
  return { id: c.id, workflow: c.workflow, mode: c.mode, checks, hardPass };
}

// --- Trajectory judge (B7) ---

function cap(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "\n…(truncated)" : s;
}

export function formatTrajectory(traj: Trajectory): string {
  const raw = traj.finalText && traj.finalText.trim() ? traj.finalText.trim() : "(no assistant text)";
  const text = cap(raw, 1500);
  const calls = traj.toolCalls.length
    ? traj.toolCalls
        .map((c, i) => {
          const tag = c.status && c.status !== "ok" ? ` [${c.status} — did NOT execute]` : "";
          return `${i + 1}. ${c.name}(${JSON.stringify(c.args)})${tag}`;
        })
        .join("\n")
    : "(no tool calls)";
  return `Assistant text:\n${text}\n\nTool calls (in order):\n${calls}`;
}

export function buildJudgePrompt(procedure: string, prompt: string, traj: Trajectory): string {
  return [
    "You are grading whether an AI agent followed a required workflow procedure.",
    "",
    "=== WORKFLOW PROCEDURE the agent was supposed to follow ===",
    cap(procedure, 1200),
    "",
    "=== USER REQUEST ===",
    prompt,
    "",
    "=== WHAT THE AGENT ACTUALLY DID ===",
    formatTrajectory(traj),
    "",
    "Question: Did the agent's FIRST actions follow the procedure's required SUBSTANTIVE first step?",
    "Tool calls ARE actions (writing a test, exploring files, asking for info) — judge them, not just text.",
    "A tool call tagged '[BLOCKED — did NOT execute]' was rejected (e.g. by a guardrail) and did NOT happen;",
    "do NOT count it. For TDD: if the first save of production code was BLOCKED and a test was written next,",
    "the agent DID follow test-first.",
    "IMPORTANT: Do NOT penalize a missing \"Using …\" announcement line — that is graded separately.",
    "Ignore whether the announcement phrase is present; judge ONLY whether the substantive actions and",
    "reasoning matched the procedure (e.g. for TDD: was a test written before/with the implementation?).",
    "",
    "End your reply with exactly these two lines and nothing after them:",
    "VERDICT: PASS   (if it followed the procedure)   or   VERDICT: FAIL   (if it did not)",
    "REASON: <one short sentence>",
  ].join("\n");
}

export function parseJudgeVerdict(text: string): { pass: boolean; reason: string; error?: boolean } {
  // 1) Simple labeled verdict — far more reliable for small judge models than JSON, so a 12B can
  //    judge a 12B (one model in VRAM) instead of needing a larger judge that spills to RAM.
  const v = text.match(/\bVERDICT\s*[:=]\s*\**\s*(PASS|FAIL|YES|NO|TRUE|FALSE)/i);
  if (v) {
    const pass = /^(PASS|YES|TRUE)$/i.test(v[1]);
    const r = text.match(/\bREASON\s*[:=]\s*(.+)/i);
    return { pass, reason: r ? r[1].replace(/\*+/g, "").trim().slice(0, 300) : "" };
  }
  // 2) JSON {"follows": bool} — kept for stronger judges that reliably emit JSON.
  const match = text.match(/\{[^{}]*"follows"[\s\S]*?\}/);
  if (match) {
    try {
      const obj = JSON.parse(match[0]);
      return { pass: obj.follows === true, reason: String(obj.reason ?? "") };
    } catch {
      /* fall through */
    }
  }
  // 3) Loose fallback: a bare follows=true/false anywhere.
  const loose = text.match(/"?follows"?\s*[:=]\s*(true|false)/i);
  if (loose) return { pass: /true/i.test(loose[1]), reason: "" };
  // A judge that emits none of the above is a JUDGE failure, not a "did not follow" verdict — flag it
  // as an error so the runner EXCLUDES it from the adherence rate (counting it as a fail deflates the
  // metric). With the labeled format above this should now be rare even on a 12B.
  return { pass: false, error: true, reason: "unparseable judge response" };
}

// --- Judge majority vote (robustness) ---

export function majorityVerdict(
  verdicts: { pass: boolean; reason?: string; error?: boolean }[],
): { pass: boolean; reason: string; error?: boolean } {
  if (verdicts.length === 0) return { pass: false, error: true, reason: "no verdicts" };
  // Errored/unparseable verdicts don't get a vote. If every verdict errored, the whole judgment is an
  // error (excluded from the rate) rather than a fail.
  const usable = verdicts.filter(v => !v.error);
  if (usable.length === 0) return { pass: false, error: true, reason: verdicts[0].reason ?? "all judge verdicts errored" };
  const passes = usable.filter(v => v.pass).length;
  const pass = passes > usable.length / 2; // strict majority; tie fails closed
  const rep = usable.find(v => v.pass === pass) ?? usable[0];
  return { pass, reason: rep.reason ?? "" };
}

// --- Regression gate (R5) ---

export interface RunSummaryLike {
  announceRate?: number;
  toolInvocationRate?: number;
  adherenceRate?: number;
  total?: number;
  hardPass?: number;
}
export interface Regression {
  metric: string;
  baseline: number;
  current: number;
  drop: number;
}

export function checkRegressions(
  baseline: RunSummaryLike,
  current: RunSummaryLike,
  margin = 0.1,
): Regression[] {
  const out: Regression[] = [];
  const rateMetrics: (keyof RunSummaryLike)[] = ["announceRate", "toolInvocationRate", "adherenceRate"];
  for (const m of rateMetrics) {
    const b = (baseline[m] as number) ?? 0;
    const c = (current[m] as number) ?? 0;
    if (c < b - margin) out.push({ metric: m, baseline: b, current: c, drop: b - c });
  }
  const bHard = baseline.total ? (baseline.hardPass ?? 0) / baseline.total : 0;
  const cHard = current.total ? (current.hardPass ?? 0) / current.total : 0;
  if (cHard < bHard - margin) out.push({ metric: "hardPassRate", baseline: bHard, current: cHard, drop: bHard - cHard });
  return out;
}

export function formatRegressions(regressions: Regression[]): string {
  if (regressions.length === 0) return "No regressions vs baseline.";
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  return (
    "REGRESSIONS vs baseline:\n" +
    regressions.map(r => `  ${r.metric}: ${pct(r.baseline)} -> ${pct(r.current)} (down ${Math.round(r.drop * 100)} pts)`).join("\n")
  );
}

// --- Judge calibration (R6) ---

export function calibrationReport(results: { expected: boolean; got: boolean }[]): {
  total: number; correct: number; agreement: number; falsePositives: number; falseNegatives: number;
} {
  let correct = 0, falsePositives = 0, falseNegatives = 0;
  for (const r of results) {
    if (r.got === r.expected) correct++;
    else if (r.got && !r.expected) falsePositives++;
    else falseNegatives++;
  }
  const total = results.length;
  return { total, correct, agreement: total ? correct / total : 0, falsePositives, falseNegatives };
}

// --- N-sample aggregation (B6) ---

export function aggregateSamples(results: CaseResult[]): { hardPassRate: number; checkRates: Record<string, number> } {
  const n = results.length || 1;
  const hardPassRate = results.filter(r => r.hardPass).length / n;
  const totals: Record<string, { pass: number; total: number }> = {};
  for (const r of results) {
    for (const c of r.checks) {
      totals[c.name] = totals[c.name] ?? { pass: 0, total: 0 };
      totals[c.name].total++;
      if (c.pass) totals[c.name].pass++;
    }
  }
  const checkRates: Record<string, number> = {};
  for (const [name, t] of Object.entries(totals)) checkRates[name] = t.pass / t.total;
  return { hardPassRate, checkRates };
}

export function summarize(results: CaseResult[]): EvalSummary {
  const rate = (num: number, den: number) => (den === 0 ? 0 : num / den);

  let announceTotal = 0, announcePass = 0;
  let toolTotal = 0, toolPass = 0;
  let loadedTotal = 0, loadedPass = 0;
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
      if (c.name === "workflowLoaded") { loadedTotal++; if (c.pass) loadedPass++; }
      if (c.name === "firstStep") { firstTotal++; if (c.pass) firstPass++; }
    }
  }

  return {
    total: results.length,
    hardPass: results.filter(r => r.hardPass).length,
    announceRate: rate(announcePass, announceTotal),
    toolInvocationRate: rate(toolPass, toolTotal),
    workflowLoadedRate: rate(loadedPass, loadedTotal),
    firstStepRate: rate(firstPass, firstTotal),
    byWorkflow,
  };
}

// --- Routing recall / precision over a labeled corpus (B3) ---------------------------------------
export interface RoutingOutcome {
  id: string;
  /** Expected skill name, or null for a benign case that must route nowhere. */
  expected: string | null;
  /** What the router actually returned. */
  got: string | null;
}

export interface RoutingReport {
  recallHit: number;
  recallTotal: number;
  recallRate: number;
  benignClean: number;
  benignTotal: number;
  benignRate: number;
  misroutes: RoutingOutcome[];
  falsePositives: RoutingOutcome[];
  perSkill: Record<string, { hit: number; total: number }>;
}

/**
 * Recall = of the labeled (non-benign) prompts, how many routed to the right skill.
 * Precision proxy = of the benign prompts, how many correctly routed nowhere (no false positive).
 * Pure: caller supplies the already-computed routes, so it works for keyword-only or keyword+semantic.
 */
export function summarizeRouting(outcomes: RoutingOutcome[]): RoutingReport {
  const labeled = outcomes.filter(o => o.expected !== null);
  const benign = outcomes.filter(o => o.expected === null);
  const perSkill: Record<string, { hit: number; total: number }> = {};
  for (const o of labeled) {
    const key = o.expected as string;
    perSkill[key] = perSkill[key] ?? { hit: 0, total: 0 };
    perSkill[key].total++;
    if (o.got === o.expected) perSkill[key].hit++;
  }
  const recallHit = labeled.filter(o => o.got === o.expected).length;
  const benignClean = benign.filter(o => o.got === null).length;
  return {
    recallHit,
    recallTotal: labeled.length,
    recallRate: labeled.length ? recallHit / labeled.length : 0,
    benignClean,
    benignTotal: benign.length,
    benignRate: benign.length ? benignClean / benign.length : 0,
    misroutes: labeled.filter(o => o.got !== o.expected),
    falsePositives: benign.filter(o => o.got !== null),
    perSkill,
  };
}
