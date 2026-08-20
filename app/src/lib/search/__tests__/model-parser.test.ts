import { afterEach, describe, expect, it, vi } from "vitest";
import { emptySearchIntent } from "../event-intent";
import {
  createOpenAIIntentParser,
  parseIntentResilient,
} from "@/lib/server/openai/event-intent-parser";

const NOW = new Date("2026-08-19T16:00:00.000Z");
const originalKey = process.env.OPENAI_API_KEY;

afterEach(() => {
  if (originalKey == null) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = originalKey;
});
describe("OpenAI event intent parser", () => {
  it("uses strict Responses output without storage and accepts validated JSON", async () => {
    process.env.OPENAI_API_KEY = "test-secret";
    const intent = emptySearchIntent();
    intent.categories = ["Music"];
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.model).toBe("gpt-5.6-luna");
      expect(body.store).toBe(false);
      expect(body.text.format.strict).toBe(true);
      expect(String(init?.headers && (init.headers as Record<string, string>).Authorization)).toContain("test-secret");
      return new Response(JSON.stringify({ output_text: JSON.stringify(intent) }), { status: 200 });
    });
    const parsed = await createOpenAIIntentParser(fetcher as typeof fetch).parse({ query: "music", priorIntent: null, now: NOW });
    expect(parsed.categories).toEqual(["Music"]);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("falls back on invalid model output", async () => {
    process.env.OPENAI_API_KEY = "test-secret";
    const parser = createOpenAIIntentParser(async () => new Response(JSON.stringify({ output_text: "not json" }), { status: 200 }));
    const parsed = await parseIntentResilient({ query: "music Friday night", priorIntent: null, now: NOW, parser });
    expect(parsed.fallbackUsed).toBe(true);
    expect(parsed.parserWarning).toBe("model-invalid");
    expect(parsed.intent.categories).toContain("Music");
  });

  it("falls back when the model times out", async () => {
    process.env.OPENAI_API_KEY = "test-secret";
    const parser = createOpenAIIntentParser(async () => {
      throw new DOMException("Timed out", "AbortError");
    });
    const parsed = await parseIntentResilient({ query: "free Saturday", priorIntent: null, now: NOW, parser });
    expect(parsed.fallbackUsed).toBe(true);
    expect(parsed.parserWarning).toBe("model-timeout");
    expect(parsed.intent.budget?.freeOnly).toBe(true);
  });

  it("is useful with no API key", async () => {
    delete process.env.OPENAI_API_KEY;
    const parsed = await parseIntentResilient({ query: "not sports Sunday", priorIntent: null, now: NOW });
    expect(parsed.fallbackUsed).toBe(true);
    expect(parsed.parserWarning).toBe("model-unavailable");
    expect(parsed.intent.exclusions.categories).toContain("Sports & Recreation");
  });
});
