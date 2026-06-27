export type HandoffExtraction = {
  response: string;
  handoffMessage?: string;
};

/**
 * Resolves the user-facing response from a parsed model output.
 * Prioritizes explicit fields, falls back to content or raw text.
 */
function resolveResponse(parsed: any, fullMatch: string | undefined, rawContent: string): string {
  if (typeof parsed.response === "string") return parsed.response.trim();
  if (typeof parsed.final_response === "string") return parsed.final_response.trim();
  
  // If it's a JSON block, the response is usually the text outside that block
  if (fullMatch) {
    return rawContent.replace(fullMatch, "").trim();
  }
  
  // Fallback to content if available, otherwise raw content
  if (typeof parsed.content === "string") return parsed.content.trim();
  return rawContent;
}

export function extractHandoffMessage(rawContent: string): HandoffExtraction {
  // Priority 1: Explicit Marker Tags
  const markerRegex = /\[HANDOFF_MESSAGE\]([\s\S]*?)\[\/HANDOFF_MESSAGE\]/i;
  const markerMatch = rawContent.match(markerRegex);
  if (markerMatch) {
    const handoff = markerMatch[1].trim();
    const response = rawContent.replace(markerRegex, "").trim();
    return {
      response,
      handoffMessage: handoff || undefined,
    };
  }

  // Priority 2: Structured JSON (Blocks or Root Objects)
  const candidates: Array<{ json: string; fullMatch?: string }> = [];
  const trimmed = rawContent.trim();

  // Improved Root JSON detection
  if (trimmed.startsWith("{") && trimmed.endsWith("}") && trimmed.length > 5) {
    candidates.push({ json: trimmed });
  }

  const fenceRegex = /```json\s*([\s\S]*?)```/gi;
  let fenceMatch: RegExpExecArray | null;
  while ((fenceMatch = fenceRegex.exec(rawContent)) !== null) {
    candidates.push({ json: fenceMatch[1], fullMatch: fenceMatch[0] });
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate.json);
      if (!parsed || typeof parsed !== "object") continue;

      const handoff = (parsed as any).handoff_message?.trim();
      if (!handoff) continue;

      return {
        response: resolveResponse(parsed, candidate.fullMatch, rawContent),
        handoffMessage: handoff,
      };
    } catch {
      // Not valid JSON; continue scanning.
    }
  }

  // Priority 3: Raw Content Fallback
  return { response: rawContent };
}
