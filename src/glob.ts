/**
 * Minimal glob → RegExp for path matching (used by the protected-paths deny-list and find_files).
 * Supports `*` (any chars except `/`), `**` (any chars incl. `/`), and `?` (one char except `/`).
 * Pure + testable; matching is case-insensitive and normalizes Windows backslashes to `/`.
 */
export function globToRegExp(glob: string): RegExp {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        re += ".*"; // `**` — cross directories
        i++;
        if (glob[i + 1] === "/") i++; // swallow the slash in `**/` so it can also match zero dirs
      } else {
        re += "[^/]*";
      }
    } else if (c === "?") {
      re += "[^/]";
    } else if ("\\^$.|+()[]{}".includes(c)) {
      re += "\\" + c;
    } else {
      re += c; // includes `/`
    }
  }
  return new RegExp("^" + re + "$", "i");
}

/** True if path `p` matches glob `glob` (backslashes normalized). */
export function matchGlob(p: string, glob: string): boolean {
  const norm = p.replace(/\\/g, "/");
  return globToRegExp(glob).test(norm);
}
