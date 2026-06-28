import { readdir, readFile, stat } from "fs/promises";
import { join } from "path";

export interface Skill {
  name: string;
  description: string;
  announce: string;
  triggers: string[];
  /** Example user prompts that should route to this skill — asserted by the routing eval. */
  examples: string[];
  /**
   * Routing precedence when multiple skills' triggers match the same prompt (C2). Higher wins.
   * Process/discipline skills (verification, brainstorming, debugging) outrank implementation skills
   * so a gate fires before the work it gates. Default 0 — replaces the old accidental alphabetical order.
   */
  priority: number;
  body: string;
}
export interface SkillMeta { name: string; description: string; announce: string; }

export function parseSkillMarkdown(markdown: string): Skill {
  const fmMatch = markdown.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!fmMatch) throw new Error("Skill is missing frontmatter (--- ... ---).");
  const [, frontmatter, body] = fmMatch;

  const lines = frontmatter.split("\n");
  const scalars: Record<string, string> = {};
  const lists: Record<string, string[]> = {};
  let currentList: string | null = null;

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    if (!line.trim()) continue;
    const listItem = line.match(/^\s*-\s+(.*)$/);
    if (currentList && listItem) {
      lists[currentList].push(unquote(listItem[1].trim()));
      continue;
    }
    const kv = line.match(/^([A-Za-z_]+):\s*(.*)$/);
    if (kv) {
      const [, key, value] = kv;
      if (value.trim() === "") {
        // A key with no inline value starts a list (e.g. `triggers:` / `examples:`).
        currentList = key;
        lists[key] = lists[key] ?? [];
        continue;
      }
      currentList = null;
      scalars[key] = unquote(value.trim());
    }
  }

  for (const required of ["name", "description", "announce"]) {
    if (!scalars[required]) throw new Error(`Skill frontmatter missing required field: ${required}`);
  }

  return {
    name: scalars.name,
    description: scalars.description,
    announce: scalars.announce,
    triggers: lists["triggers"] ?? [],
    examples: lists["examples"] ?? [],
    priority: parsePriority(scalars.priority),
    body: body.trim(),
  };
}

function parsePriority(value: string | undefined): number {
  if (value === undefined) return 0;
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : 0;
}

function unquote(value: string): string {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1).replace(/\\\\/g, "\\");
  }
  return value;
}

export interface SkillIssue {
  skill: string;
  issue: string;
}

/**
 * Validate loaded skills so a malformed one fails loudly instead of silently never firing (DoD5):
 * required fields present, trigger regexes compile, names unique, every skill has examples.
 */
export function validateSkills(skills: Skill[]): SkillIssue[] {
  const issues: SkillIssue[] = [];
  const seen = new Set<string>();
  for (const s of skills) {
    const name = s.name || "(unnamed)";
    if (!s.name) issues.push({ skill: name, issue: "missing name" });
    if (s.name && seen.has(s.name)) issues.push({ skill: name, issue: "duplicate name" });
    if (s.name) seen.add(s.name);
    if (!s.description) issues.push({ skill: name, issue: "missing description" });
    if (!s.announce) issues.push({ skill: name, issue: "missing announce" });
    if (!s.examples || s.examples.length === 0) {
      issues.push({ skill: name, issue: "no examples — routing is not eval-covered" });
    }
    for (const t of s.triggers || []) {
      try {
        new RegExp(t, "i");
      } catch {
        issues.push({ skill: name, issue: `invalid trigger regex: ${t}` });
      }
    }
  }
  return issues;
}

/**
 * Deterministic routing order (C2): highest `priority` first, then alphabetical as a stable tiebreak.
 * First match in this order wins, so a higher-priority gate (verification) beats a lower one (finishing).
 */
export function byPrecedence(a: Skill, b: Skill): number {
  return (b.priority ?? 0) - (a.priority ?? 0) || a.name.localeCompare(b.name);
}

export function matchTriggers(skills: Skill[], userText: string): string | null {
  const sorted = [...skills].sort(byPrecedence);
  for (const skill of sorted) {
    for (const source of skill.triggers) {
      let regex: RegExp;
      try { regex = new RegExp(source, "i"); } catch { continue; }
      if (regex.test(userText)) return skill.name;
    }
  }
  return null;
}

export function renderDispatcherTable(skills: Skill[]): string {
  const rows = [...skills]
    .sort(byPrecedence)
    .map(s => `| ${s.description} | \`${s.name}\` |`)
    .join("\n");
  return [
    "| When the task matches | Call use_workflow with |",
    "|---|---|",
    rows,
  ].join("\n");
}

/**
 * Compact dispatcher (E1): one bullet per skill, in precedence order, no table chrome.
 * Cheaper per turn than the markdown table and less prone to small-model overthinking,
 * while still naming each workflow + what it does so the model can self-route via use_workflow.
 */
export type InjectionAction = "injected" | "reinjected" | "deduped" | "sticky" | "expired" | "no-match";
export interface InjectionState {
  lastInjectedWorkflow: string | null;
  turnsSinceWorkflowInject: number;
  noMatchStreak: number;
}

/**
 * Decide whether to (re)inject the matched workflow body, and keep the active workflow alive across
 * follow-up turns that don't re-match (sticky), so multi-turn tasks don't lose the procedure or the
 * code guardrail. Pure + testable.
 *  - new/switched match → inject
 *  - same match → dedup, or reinject every `reinjectInterval` turns
 *  - no match but a workflow is active → stay `sticky`, until `stickyTurns` consecutive no-match turns → `expired`
 *  - no match and nothing active → no-match
 * `reinjectInterval <= 0` disables re-injection. `stickyTurns <= 0` disables stickiness (clear at once).
 */
export function decideWorkflowInjection(
  routedName: string | null,
  state: InjectionState,
  reinjectInterval: number,
  stickyTurns: number,
): { action: InjectionAction; nextState: InjectionState } {
  const prevStreak = state.noMatchStreak ?? 0;
  // 1) A new (or switched) workflow matched → inject it now.
  if (routedName && routedName !== state.lastInjectedWorkflow) {
    return { action: "injected", nextState: { lastInjectedWorkflow: routedName, turnsSinceWorkflowInject: 0, noMatchStreak: 0 } };
  }
  const active = routedName ?? state.lastInjectedWorkflow;
  // 2) Nothing active and nothing matched.
  if (!active) {
    return { action: "no-match", nextState: { lastInjectedWorkflow: null, turnsSinceWorkflowInject: 0, noMatchStreak: 0 } };
  }
  const matchedThisTurn = routedName === active;
  const noMatchStreak = matchedThisTurn ? 0 : prevStreak + 1;
  // 3) No match this turn but a workflow is active → expire after the sticky window (or at once if disabled).
  if (!matchedThisTurn && (stickyTurns <= 0 || noMatchStreak >= stickyTurns)) {
    return { action: "expired", nextState: { lastInjectedWorkflow: null, turnsSinceWorkflowInject: 0, noMatchStreak: 0 } };
  }
  // 4) Periodic re-injection so the procedure survives a long task (fires on sticky turns too).
  const turns = state.turnsSinceWorkflowInject + 1;
  if (reinjectInterval > 0 && turns >= reinjectInterval) {
    return { action: "reinjected", nextState: { lastInjectedWorkflow: active, turnsSinceWorkflowInject: 0, noMatchStreak } };
  }
  // 5) Carry forward without re-injecting.
  return { action: matchedThisTurn ? "deduped" : "sticky", nextState: { lastInjectedWorkflow: active, turnsSinceWorkflowInject: turns, noMatchStreak } };
}

export function renderDispatcherCompact(skills: Skill[]): string {
  return [...skills]
    .sort(byPrecedence)
    .map(s => `- \`${s.name}\` — ${s.description}`)
    .join("\n");
}

export function buildWorkflowToolResult(skill: Skill): { announce: string; instructions: string } {
  return {
    announce: `Before doing anything else (including any tool call), output the line: "Using ${skill.announce} —". Then proceed.`,
    instructions: skill.body,
  };
}

export function decideRouterInjection(
  skills: Skill[],
  userText: string,
  lastInjected: string | null,
): { name: string; body: string } | null {
  const name = matchTriggers(skills, userText);
  if (!name || name === lastInjected) return null;
  const skill = skills.find(s => s.name === name);
  if (!skill) return null;
  return { name, body: skill.body };
}

export function getSkillsDirCandidates(pluginRoot: string, workspaceDir: string): string[] {
  return [
    join(pluginRoot, "skills"),
    join(workspaceDir, "skills"),
  ];
}

export async function loadSkills(candidateDirs: string[]): Promise<Skill[]> {
  for (const dir of candidateDirs) {
    try {
      const entries = await readdir(dir);
      const files = entries.filter(f => f.endsWith(".md"));
      if (files.length === 0) continue;
      const skills: Skill[] = [];
      for (const file of files) {
        try {
          const md = await readFile(join(dir, file), "utf-8");
          skills.push(parseSkillMarkdown(md));
        } catch {
          // Skip malformed/unreadable skill file; keep loading the rest.
        }
      }
      if (skills.length > 0) return skills;
    } catch {
      // Dir missing — try next candidate.
    }
  }
  return [];
}

/**
 * Lightweight fingerprint of the active skills dir: chosen dir + each .md file's mtime (G2).
 * Cheap (readdir + stat, no file contents) so it can run every turn; when it changes we re-parse.
 */
export async function skillsSignature(candidateDirs: string[]): Promise<string> {
  for (const dir of candidateDirs) {
    try {
      const entries = await readdir(dir);
      const files = entries.filter(f => f.endsWith(".md")).sort();
      if (files.length === 0) continue;
      const parts = await Promise.all(
        files.map(async f => `${f}:${(await stat(join(dir, f))).mtimeMs}`)
      );
      return `${dir}|${parts.join(",")}`;
    } catch {
      // Dir missing — try next candidate.
    }
  }
  return "";
}

let cached: Skill[] | null = null;
let cachedSignature: string | null = null;
export async function loadSkillsCached(candidateDirs: string[]): Promise<Skill[]> {
  // Cache-bust when any skill file's mtime changes, so edits don't require a full plugin restart (G2).
  const sig = await skillsSignature(candidateDirs);
  if (cached && sig === cachedSignature) return cached;
  cached = await loadSkills(candidateDirs);
  cachedSignature = sig;
  return cached;
}
