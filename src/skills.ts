import { readdir, readFile } from "fs/promises";
import { join } from "path";

export interface Skill {
  name: string;
  description: string;
  announce: string;
  triggers: string[];
  /** Example user prompts that should route to this skill — asserted by the routing eval. */
  examples: string[];
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
    body: body.trim(),
  };
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

export function matchTriggers(skills: Skill[], userText: string): string | null {
  const sorted = [...skills].sort((a, b) => a.name.localeCompare(b.name));
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
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(s => `| ${s.description} | \`${s.name}\` |`)
    .join("\n");
  return [
    "| When the task matches | Call use_workflow with |",
    "|---|---|",
    rows,
  ].join("\n");
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

let cached: Skill[] | null = null;
export async function loadSkillsCached(candidateDirs: string[]): Promise<Skill[]> {
  if (cached) return cached;
  cached = await loadSkills(candidateDirs);
  return cached;
}
