// Tiny dotenv-style loader for the eval harness (no deps). Lets you keep your machine-specific
// settings — LM Studio API token, chat/embedding/judge model ids, judge votes — in a gitignored
// `eval/eval.local.env` so `npm run eval` works without exporting vars every run.
// Shell/CLI env always wins: a value already set in process.env is never overwritten.
const fs = require("fs");

// Pure: parse KEY=VALUE lines (ignores blanks and #comments; strips matching surrounding quotes).
function parseEnvFile(text) {
  const out = {};
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if (v.length >= 2 && ((v[0] === '"' && v.endsWith('"')) || (v[0] === "'" && v.endsWith("'")))) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  }
  return out;
}

// Apply a local env file to process.env without clobbering anything already set. Returns the keys
// actually applied (for logging). Missing file = no-op (returns []).
function loadLocalEnv(filePath) {
  let text;
  try {
    text = fs.readFileSync(filePath, "utf8");
  } catch {
    return [];
  }
  const applied = [];
  for (const [k, v] of Object.entries(parseEnvFile(text))) {
    if (process.env[k] === undefined || process.env[k] === "") {
      process.env[k] = v;
      applied.push(k);
    }
  }
  return applied;
}

module.exports = { parseEnvFile, loadLocalEnv };
