/**
 * Thinking settings for latency-sensitive Gemini calls (search, not ingestion).
 * Gemini 3.x flash thinks at "medium" by default, which alone put search
 * requests past 7s and tripped the intent parser's timeout. "low" is the
 * lowest level 3.7 Flash accepts ("minimal" is rejected). Other model
 * families take different or no thinking settings, so they get none rather
 * than a request the API might reject.
 */
export function fastThinkingConfig(model: string): { thinkingConfig?: { thinkingLevel: "low" } } {
  return /^gemini-3(\.|-|$)/.test(model) ? { thinkingConfig: { thinkingLevel: "low" } } : {};
}
