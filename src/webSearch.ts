// Pure, testable helpers for the web tools (toolsProvider keeps the network I/O). Extracted so the
// query-normalization and boilerplate-stripping logic can be unit-tested without the SDK.

/**
 * Browser-like headers for content fetches. Many sites (e.g. SEI in a real run) return 403 to a
 * header-less request — a default `fetch(url)` sends no User-Agent. Sending a realistic UA + Accept
 * dramatically cuts those false failures.
 */
export const WEB_FETCH_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

/**
 * Normalize the various ways the model asks for a web search into a deduped query list.
 *
 * gemma-4-12b-qat consistently wants to run MULTIPLE queries at once — sometimes as `query: [..]`,
 * sometimes as `queries: [..]` — but the schema historically accepted only a single `query` string,
 * so those calls hard-failed validation ("params.query is not of a type(s) string") and stalled the
 * agent loop. This accepts string | string[] for `query` plus an optional `queries` array; trims,
 * drops empties, dedupes case-insensitively, and caps the count to bound cost.
 */
export function normalizeSearchQueries(query: unknown, queries: unknown, max = 5): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (v: unknown) => {
    if (typeof v !== "string") return;
    const t = v.trim();
    if (!t) return;
    const key = t.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(t);
  };
  const consume = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(push);
    else push(v);
  };
  consume(query);
  consume(queries);
  return out.slice(0, Math.max(1, max));
}

/**
 * Whether a content-type is text-extractable. Guards the fetch tools from running html-to-text on a
 * PDF/binary (which yields garbage the model treats as real content). Missing/empty type → assume
 * textual, since many servers omit it and we don't want false rejects. Pure.
 */
export function isTextualContentType(contentType: string | null | undefined): boolean {
  if (!contentType) return true;
  return /text\/|html|xml|json|rss|atom|javascript|application\/xhtml/i.test(contentType);
}

/**
 * Strip obvious boilerplate from html-to-text output so a content-less landing page (nav menus + icon
 * sprites, e.g. the Copernicus highlights page) doesn't read as the article and waste the model's
 * fetch. Conservative: removes the "skip to main content" marker and concatenated icon/sprite runs
 * (45+ chars with no whitespace — never real prose), then collapses whitespace. Pure.
 */
export function stripPageBoilerplate(text: string): string {
  if (!text) return "";
  return text
    .replace(/skip to main content/gi, " ")
    .replace(/\S{45,}/g, " ") // icon-sprite / nav token runs rendered as one long token
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
