/**
 * Semantic router (backlog C1) — pure logic. When the keyword/regex triggers miss, match the user
 * message against each skill's description+examples via embedding cosine similarity. This is the fix
 * for the regex router's 0/9 recall on naturally-phrased requests. Embedding I/O is environment-
 * specific (plugin: LM Studio SDK; eval: OpenAI /embeddings) — only the matching math lives here.
 */

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export interface SkillEmbedding {
  name: string;
  vector: number[];
}

// threshold: minimum cosine of the best match. margin: the best must beat the runner-up by at least
// this much (confidence gate) — embedding scores for these skills are compressed and several overlap
// (verify/review/finish), so without a margin a low threshold mis-routes ambiguous prompts.
export function semanticMatch(
  query: number[],
  skillEmbeddings: SkillEmbedding[],
  threshold: number,
  margin = 0,
): { name: string; score: number } | null {
  const scored = skillEmbeddings
    .map(s => ({ name: s.name, score: cosineSimilarity(query, s.vector) }))
    .sort((a, b) => b.score - a.score);
  if (scored.length === 0) return null;
  const best = scored[0];
  if (best.score < threshold) return null;
  if (scored.length > 1 && best.score - scored[1].score < margin) return null;
  return best;
}

/** Text embedded to represent when a skill applies — its description plus example phrasings. */
export function buildEmbeddingText(skill: { description: string; examples?: string[] }): string {
  const ex = (skill.examples || []).join("; ");
  return ex ? `${skill.description}. Examples: ${ex}` : skill.description;
}

// nomic-embed models require task-instruction prefixes; without them query↔document cosine scores
// come out too low to clear the threshold. Apply these at the embedding call sites.
export const QUERY_PREFIX = "search_query: ";
export const DOC_PREFIX = "search_document: ";
