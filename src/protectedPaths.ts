import { matchGlob } from "./glob";

/**
 * Code-enforced deny-list (the security boundary that replaces the old path-sandbox). An untrusted
 * small model cannot be relied on to avoid reading/writing secrets — so we BLOCK sensitive paths in
 * code, on reads, writes, and search. Sensible defaults ship even when the user config is empty;
 * user-configured globs ADD to them.
 */
export const DEFAULT_PROTECTED_GLOBS: string[] = [
  // credential / key directories (block the dir and everything under it)
  "**/.ssh", "**/.ssh/**",
  "**/.aws", "**/.aws/**",
  "**/.gnupg", "**/.gnupg/**",
  "**/.kube", "**/.kube/**",
  "**/.gcloud", "**/.gcloud/**", "**/gcloud/**",
  "**/.docker/config.json",
  // secret files anywhere
  "**/.env", "**/.env.*",
  "**/*.pem", "**/*.key", "**/*.pfx", "**/*.p12",
  "**/id_rsa*", "**/id_ed25519*", "**/id_dsa*", "**/id_ecdsa*",
  "**/.npmrc", "**/.pypirc", "**/.netrc",
];

/** Parse the `protectedPaths` config string (newline- or comma-separated globs). */
export function parseProtectedGlobs(config: string): string[] {
  return (config || "")
    .split(/[\n,]/)
    .map(s => s.trim())
    .filter(Boolean);
}

/** Merge the defaults with the user config into the active deny-list. */
export function buildProtectedGlobs(config: string): string[] {
  return [...DEFAULT_PROTECTED_GLOBS, ...parseProtectedGlobs(config)];
}

/** True if `resolvedPath` is denied by any glob in `globs`. */
export function isProtectedPath(resolvedPath: string, globs: string[]): boolean {
  return globs.some(g => matchGlob(resolvedPath, g));
}
