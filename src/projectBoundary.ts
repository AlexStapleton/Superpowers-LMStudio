import { relative, isAbsolute, join } from "path";

/**
 * True if `resolved` is inside (or equal to) `boundaryRoot`. relative()-based so it correctly rejects
 * sibling-prefix paths (e.g. /proj vs /proj-x). Both args must be absolute, already-resolved paths.
 */
export function isWithinBoundary(boundaryRoot: string, resolved: string): boolean {
  const rel = relative(boundaryRoot, resolved);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

export type MemoryScope = "auto" | "global" | "project";

/**
 * Resolve the memory file path. `auto`/`project` => <projectDir>/.beledarian/memory.md when a project
 * dir is set, else the CWD-independent global file in the toolbox home. `global` => always the global file.
 */
export function resolveMemoryPath(
  scope: MemoryScope,
  projectDirectory: string | null,
  toolboxHome: string,
): string {
  const globalPath = join(toolboxHome, "memory.md");
  if (scope === "global") return globalPath;
  return projectDirectory ? join(projectDirectory, ".beledarian", "memory.md") : globalPath;
}

export type ProjectCommand =
  | { kind: "set"; path: string }
  | { kind: "clear" }
  | { kind: "show" }
  | { kind: "none" };

/**
 * Parse a leading `/project` command from a raw user message. Tolerant: trims, case-insensitive keyword,
 * strips one layer of surrounding quotes so paths with spaces survive. Non-/project text => { kind: "none" }.
 */
export function parseProjectCommand(text: string): ProjectCommand {
  const trimmed = (text ?? "").trim();
  const m = trimmed.match(/^\/project(?:\s+([\s\S]+))?$/i);
  if (!m) return { kind: "none" };
  const arg = (m[1] ?? "").trim();
  if (!arg) return { kind: "show" };
  if (arg.toLowerCase() === "clear") return { kind: "clear" };
  const unquoted = arg.replace(/^["']|["']$/g, "").trim();
  return { kind: "set", path: unquoted };
}
