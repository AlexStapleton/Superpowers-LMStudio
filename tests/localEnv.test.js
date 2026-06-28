const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { parseEnvFile, loadLocalEnv } = require("../eval/localEnv.js");

test("parseEnvFile reads KEY=VALUE, ignores comments/blanks, strips quotes", () => {
  const out = parseEnvFile([
    "# a comment",
    "",
    "EVAL_API_KEY=sk-lm-abc:def",
    "EVAL_JUDGE_MODEL = qwen3.6-27b-mtp ",
    'QUOTED="text-embedding-nomic"',
    "SINGLE='val'",
    "not a valid line",
  ].join("\n"));
  assert.equal(out.EVAL_API_KEY, "sk-lm-abc:def");
  assert.equal(out.EVAL_JUDGE_MODEL, "qwen3.6-27b-mtp");
  assert.equal(out.QUOTED, "text-embedding-nomic");
  assert.equal(out.SINGLE, "val");
  assert.equal("not a valid line" in out, false);
});

test("loadLocalEnv applies values but never clobbers existing env; missing file is a no-op", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "localenv-"));
  const file = path.join(dir, "eval.local.env");
  fs.writeFileSync(file, "ZZ_FROM_FILE=fromfile\nZZ_PRESET=fromfile\n");

  delete process.env.ZZ_FROM_FILE;
  process.env.ZZ_PRESET = "preset"; // shell/CLI wins

  const applied = loadLocalEnv(file);
  assert.equal(process.env.ZZ_FROM_FILE, "fromfile");
  assert.equal(process.env.ZZ_PRESET, "preset", "must not override an already-set var");
  assert.deepEqual(applied, ["ZZ_FROM_FILE"]);

  assert.deepEqual(loadLocalEnv(path.join(dir, "nope.env")), []);

  delete process.env.ZZ_FROM_FILE;
  delete process.env.ZZ_PRESET;
  fs.rmSync(dir, { recursive: true, force: true });
});
