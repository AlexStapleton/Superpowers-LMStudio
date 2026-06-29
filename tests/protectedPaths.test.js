const test = require("node:test");
const assert = require("node:assert/strict");
const { isProtectedPath, buildProtectedGlobs, parseProtectedGlobs, DEFAULT_PROTECTED_GLOBS } = require("../dist/protectedPaths.js");

test("defaults block credential dirs and secret files", () => {
  const g = DEFAULT_PROTECTED_GLOBS;
  assert.equal(isProtectedPath("/home/u/.ssh/id_rsa", g), true);
  assert.equal(isProtectedPath("C:\\Users\\x\\.ssh\\id_ed25519", g), true);
  assert.equal(isProtectedPath("/proj/.env", g), true);
  assert.equal(isProtectedPath("/proj/config/prod.env.local", g), true); // prefixed env file is still a secret
  assert.equal(isProtectedPath("/proj/config/app.config.json", g), false); // an ordinary config file is fine
  assert.equal(isProtectedPath("/proj/.env.production", g), true);
  assert.equal(isProtectedPath("/proj/server.pem", g), true);
  assert.equal(isProtectedPath("/home/u/.aws/credentials", g), true);
});

test("ordinary project files are NOT protected", () => {
  const g = DEFAULT_PROTECTED_GLOBS;
  assert.equal(isProtectedPath("/proj/src/index.ts", g), false);
  assert.equal(isProtectedPath("/proj/eval/report.json", g), false);
  assert.equal(isProtectedPath("/proj/README.md", g), false);
});

test("parseProtectedGlobs splits on commas/newlines; buildProtectedGlobs merges with defaults", () => {
  assert.deepEqual(parseProtectedGlobs("**/secret.txt, **/private/**\n  **/tokens"), ["**/secret.txt", "**/private/**", "**/tokens"]);
  const merged = buildProtectedGlobs("**/my-secrets/**");
  assert.ok(merged.length > DEFAULT_PROTECTED_GLOBS.length);
  assert.equal(isProtectedPath("/proj/my-secrets/a.txt", merged), true);
  assert.equal(isProtectedPath("/proj/my-secrets/a.txt", DEFAULT_PROTECTED_GLOBS), false); // only via user config
});
