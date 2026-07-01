export type MemoryType = "user" | "preference" | "project" | "reference";

export interface MemoryEntry {
  id: string;
  type: MemoryType;
  title: string;
  fact: string;
  added: string;        // YYYY-MM-DD
  updated?: string;     // YYYY-MM-DD
  source: "chat" | "user";
}

export interface ParsedMemory {
  preamble: string;     // freeform text before the first block, preserved verbatim
  entries: MemoryEntry[];
}

const HEADER_RE = /^##\s+(user|preference|project|reference)\s*:\s*(.+?)\s*$/i;
const META_RE = /^<!--\s*(.*?)\s*-->\s*$/;
const LEGACY_RE = /^-\s*\[([^\]]*)\]\s*(.+?)\s*$/; // "- [ts] fact"

/** First ~8 words → sentence-cased title + kebab-case id. Never returns an empty id. */
export function slugTitle(fact: string): { title: string; id: string } {
  const words = fact.trim().split(/\s+/).slice(0, 8).join(" ");
  const title = words ? words.charAt(0).toUpperCase() + words.slice(1) : "Memory";
  const id = words.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "memory";
  return { title, id };
}

export function parseMemory(md: string): ParsedMemory {
  const lines = (md ?? "").split(/\r?\n/);
  const entries: MemoryEntry[] = [];
  const preambleLines: string[] = [];
  let i = 0;
  let firstHeaderSeen = false;

  while (i < lines.length) {
    const h = lines[i].match(HEADER_RE);
    if (h) {
      firstHeaderSeen = true;
      const type = h[1].toLowerCase() as MemoryType;
      const title = h[2].trim();
      let j = i + 1;
      while (j < lines.length && lines[j].trim() === "") j++;
      let id = "", added = "", updated: string | undefined, source: "chat" | "user" = "chat";
      const meta = j < lines.length ? lines[j].match(META_RE) : null;
      if (meta) {
        for (const field of meta[1].split("|")) {
          const idx = field.indexOf(":");
          if (idx < 0) continue;
          const k = field.slice(0, idx).trim();
          const v = field.slice(idx + 1).trim();
          if (k === "id") id = v;
          else if (k === "added") added = v;
          else if (k === "updated") updated = v;
          else if (k === "source") source = v === "user" ? "user" : "chat";
        }
        j++;
      }
      const factLines: string[] = [];
      while (j < lines.length && !HEADER_RE.test(lines[j])) { factLines.push(lines[j]); j++; }
      const fact = factLines.join("\n").trim();
      if (!id) id = slugTitle(title).id;
      entries.push({ id, type, title, fact, added, updated, source });
      i = j;
      continue;
    }
    if (!firstHeaderSeen) {
      const lg = lines[i].match(LEGACY_RE);
      if (lg) {
        const fact = lg[2].trim();
        const { title, id } = slugTitle(fact);
        entries.push({ id, type: "user", title, fact, added: (lg[1] || "").slice(0, 10), source: "chat" });
      } else {
        preambleLines.push(lines[i]);
      }
    }
    i++;
  }

  return { preamble: preambleLines.join("\n").trim(), entries };
}

export function serializeMemory(p: ParsedMemory): string {
  const parts: string[] = ["# Memory", ""];
  const pre = (p.preamble ?? "").trim();
  if (pre && pre !== "# Memory") parts.push(pre, "");
  for (const e of p.entries) {
    parts.push(`## ${e.type}: ${e.title}`);
    const meta = [`id: ${e.id}`, `added: ${e.added}`];
    if (e.updated) meta.push(`updated: ${e.updated}`);
    meta.push(`source: ${e.source}`);
    parts.push(`<!-- ${meta.join(" | ")} -->`, e.fact, "");
  }
  return parts.join("\n").replace(/\n+$/, "\n");
}

export function upsertMemory(
  p: ParsedMemory,
  input: { fact: string; type: MemoryType; date: string; matchId?: string },
): { next: ParsedMemory; action: "added" | "updated" } {
  const entries = p.entries.slice();
  const fact = input.fact.trim();
  if (input.matchId) {
    const idx = entries.findIndex(e => e.id === input.matchId);
    if (idx >= 0) {
      entries[idx] = { ...entries[idx], fact, type: input.type, updated: input.date };
      return { next: { ...p, entries }, action: "updated" };
    }
  }
  const { title, id } = slugTitle(fact);
  let uniqueId = id, n = 2;
  while (entries.some(e => e.id === uniqueId)) uniqueId = `${id}-${n++}`;
  entries.push({ id: uniqueId, type: input.type, title, fact, added: input.date, source: "chat" });
  return { next: { ...p, entries }, action: "added" };
}

export function forgetMemory(
  p: ParsedMemory,
  input: { matchId: string },
): { next: ParsedMemory; action: "forgotten" | "not_found" } {
  const idx = p.entries.findIndex(e => e.id === input.matchId);
  if (idx < 0) return { next: p, action: "not_found" };
  const entries = p.entries.slice();
  entries.splice(idx, 1);
  return { next: { ...p, entries }, action: "forgotten" };
}

function normalizeWords(s: string): Set<string> {
  return new Set(s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim().split(" ").filter(Boolean));
}

/** Token-Jaccard fallback used only when the embedding model is unavailable. */
export function stringSimilarityMatch(fact: string, entries: MemoryEntry[], threshold = 0.6): string | null {
  const a = normalizeWords(fact);
  if (a.size === 0) return null;
  let best: { id: string; score: number } | null = null;
  for (const e of entries) {
    const b = normalizeWords(e.fact);
    if (b.size === 0) continue;
    let inter = 0;
    for (const w of a) if (b.has(w)) inter++;
    const union = a.size + b.size - inter;
    const score = union === 0 ? 0 : inter / union;
    if (!best || score > best.score) best = { id: e.id, score };
  }
  return best && best.score >= threshold ? best.id : null;
}

const TYPE_ORDER: MemoryType[] = ["user", "preference", "project", "reference"];

export function renderForInjection(p: ParsedMemory, opts: { maxChars: number }): string {
  if (p.entries.length === 0) return "";
  const groups = new Map<MemoryType, MemoryEntry[]>();
  for (const e of p.entries) (groups.get(e.type) ?? groups.set(e.type, []).get(e.type)!).push(e);

  const build = (titlesOnly: boolean) => {
    const head = titlesOnly
      ? "## Long-term memory (titles only — over size budget; ask to recall details)"
      : "## Long-term memory (remembered facts)";
    const out: string[] = [head];
    for (const t of TYPE_ORDER) {
      const es = groups.get(t);
      if (!es || es.length === 0) continue;
      out.push(`\n### ${t}`);
      for (const e of es) out.push(titlesOnly ? `- ${e.title}` : `- ${e.title}: ${e.fact}`);
    }
    return out.join("\n");
  };

  const full = build(false);
  return full.length <= opts.maxChars ? full : build(true);
}
