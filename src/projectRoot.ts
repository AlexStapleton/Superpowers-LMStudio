import { dirname, join } from "path";

/**
 * Walk up from `startDir` to the nearest ancestor that looks like a project root (contains `.git` or
 * `package.json`); fall back to `startDir` itself. Used so that when the model reads/lists an ABSOLUTE
 * path, the workspace auto-roots at that path's project — letting it then freely explore the project
 * for context with ordinary relative paths, instead of being walled off to a single default workspace.
 *
 * Pure: the existence check is injected so it's testable without touching the filesystem.
 */
export function findProjectRoot(startDir: string, exists: (p: string) => boolean): string {
  let cur = startDir;
  for (let i = 0; i < 40; i++) {
    if (exists(join(cur, ".git")) || exists(join(cur, "package.json"))) return cur;
    const parent = dirname(cur);
    if (parent === cur) break; // reached the filesystem root
    cur = parent;
  }
  return startDir;
}
