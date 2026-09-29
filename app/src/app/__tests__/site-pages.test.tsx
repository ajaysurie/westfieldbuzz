import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import AgentsPage from "../agents/page";
import SourcesPage from "../sources/page";
import SubscribePage, { metadata as subscribeMetadata } from "../subscribe/page";
import sitemap from "../sitemap";

// The signup form reads auth state; tests have no Firebase keys.
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: null }) }));

describe("sources and agents pages", () => {
  it("renders the sources page with every registry source", () => {
    const html = renderToStaticMarkup(<SourcesPage />);
    expect(html).toContain("Where our events come from");
    expect(html).toContain("Westfield Memorial Library");
    expect(html).toContain("Westfield Buzz Instagram curator");
    expect(html).toContain("Know a source");
  });

  it("renders the agents page with API docs", () => {
    const html = renderToStaticMarkup(<AgentsPage />);
    expect(html).toContain("/api/events");
    expect(html).toContain("llms.txt");
  });

  it("renders a standalone Friday list page with the signup form", () => {
    const html = renderToStaticMarkup(<SubscribePage />);
    expect(html).toContain("Plan your weekend.");
    expect(html).toContain('aria-label="Friday email signup"');
    expect(html).toContain("Fridays, morning");
    expect(html).toContain("One click, in every email");
    expect(subscribeMetadata.alternates?.canonical).toBe("/subscribe");
  });

  it("includes /sources and /agents in the sitemap", async () => {
    const entries = await sitemap();
    const urls = entries.map((entry) => entry.url);
    expect(urls).toContain("https://www.westfieldbuzz.com/subscribe");
    expect(urls).toContain("https://www.westfieldbuzz.com/sources");
    expect(urls).toContain("https://www.westfieldbuzz.com/agents");
  });

  it("links the new pages from llms.txt", () => {
    const llmsTxt = readFileSync(
      join(__dirname, "..", "..", "..", "public", "llms.txt"),
      "utf8",
    );
    expect(llmsTxt).toContain("https://www.westfieldbuzz.com/sources");
    expect(llmsTxt).toContain("https://www.westfieldbuzz.com/agents");
  });
});
