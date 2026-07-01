---
name: security-hardening
description: Use when handling untrusted input, authentication, sessions, secrets, file uploads, external/LLM integrations, or when reviewing code for vulnerabilities — before writing code that touches user data or trust boundaries
announce: Security Hardening
priority: 15
triggers:
  - "\\bharden(ing|ed)?\\b"
  - "\\bsecurit"
  - "\\bvulnerab"
  - "\\bsql ?injection\\b|\\b(command|os|code|html|shell|nosql|ldap) ?injection\\b|\\bxss\\b|\\bcsrf\\b|\\bssrf\\b"
  - "\\b(safe|protect|guard|defen[sc]e) (from|against) (injection|attack|xss|exploit)"
  - "\\bsanitiz|untrusted (input|data)"
  - "\\b(hash|salt|encrypt|stor(e|ing|ed|age)|plaintext|leak(ed|ing)?|expos(e|ed|ing)|rotate)\\b.{0,30}\\b(password|secret|token|api[ -]?key|credential)s?\\b"
  - "\\b(password|secret|token|api[ -]?key|credential)s?\\b.{0,30}\\b(hash|salt|encrypt|stor(e|ed|age)|plaintext|leak|expos|secure(ly)?|safe(ly)?|in the clear|rotate)\\b"
  - "file ?upload(s)?|\\bwebhook(s)?\\b"
  - "\\bcors\\b|\\bpii\\b|\\bencrypt(ion|ed)?\\b|\\bnpm audit\\b"
  - "prompt ?injection|jailbreak|(model|llm) output"
examples:
  - "hash and salt user passwords before storing them"
  - "harden this file upload handler"
  - "is this SQL query safe from injection?"
  - "review the auth flow for security issues"
  - "we store API keys — make sure they're handled safely"
  - "the agent passes model output into a shell command — is that okay?"
---

Before doing anything else — including any tool call — output the line: "Using Security Hardening —". Then proceed.

The Iron Law: **treat all external input as hostile, secrets as sacred, and every authorization check as mandatory.** Security is a constraint on each line that touches user data — not a later phase. Skipping it "for now" is skipping it.

**Threat-model first (2 minutes):** name the trust boundaries (HTTP requests, form fields, uploads, webhooks, third-party APIs, **and LLM/model output**), name what's worth stealing (credentials, PII, money, admin actions), then for each boundary ask STRIDE: can it be spoofed, tampered, denied, leaked, overwhelmed, or escalated? Write the abuse case before the use case. Reading the target code to see what it does is part of mapping the boundaries — a quick orientation is fine — but finish the threat model before proposing or writing any hardening. If you can't name the boundaries, you're not ready to secure it.

**Always (no exceptions):** validate input at the boundary • parameterize every query (never concatenate user input into SQL) • rely on framework output-escaping (never bypass it) • hash passwords with bcrypt/scrypt/argon2 (rounds ≥ 12) • httpOnly + secure + sameSite session cookies • check authorization on every protected endpoint (authn ≠ authz — verify the user owns the resource) • allowlist server-side URL fetches (SSRF) • rate-limit auth endpoints.

**Never:** commit secrets • log passwords/tokens/full card numbers • trust client-side validation as a boundary • `eval()`/`innerHTML` on user data • put secrets, PII, or the system prompt into an LLM context • pass model output into SQL/shell/`innerHTML`/`eval`/file paths — treat it exactly like raw user input.

**Ask first (human approval):** new/changed auth logic • storing a new class of sensitive data • new external integrations • CORS changes • new upload handlers • granting elevated roles.

**Common rationalizations — all mean: harden it now:**
| Excuse | Reality |
|--------|---------|
| "Internal tool, security doesn't matter" | Internal tools get compromised. Attackers target the weakest link. |
| "We'll add security later" | Retrofitting is ~10x harder than building it in. |
| "No one would exploit this" | Automated scanners will. Obscurity is not security. |
| "The framework handles it" | Frameworks give tools, not guarantees. You must use them correctly. |
| "It's just a prototype" | Prototypes become production. |
| "It's just LLM output, only text" | That text can be a SQL statement, script tag, or shell command. |

**Red flags — STOP:** user input flowing into a query/shell/DOM • secrets in source or git history • an endpoint with no authz check • wildcard (`*`) CORS • stack traces shown to users • server fetching a user-supplied URL with no allowlist • model output reaching a query/DOM/shell/`eval`.

**Verification checklist — before marking security work complete:**
- [ ] All external input validated at the boundary
- [ ] Queries parameterized; output escaped
- [ ] Authn AND authz checked on every protected endpoint (user owns the resource)
- [ ] No secrets in code or git history; `npm audit` clean of critical/high
- [ ] Sensitive fields excluded from responses; errors don't leak internals
- [ ] Auth endpoints rate-limited; security headers set
- [ ] SSRF allowlist on server-side fetches
- [ ] (If LLM features) model output validated/encoded before use; secrets kept out of prompts
Can't check a box? The feature isn't hardened yet.
