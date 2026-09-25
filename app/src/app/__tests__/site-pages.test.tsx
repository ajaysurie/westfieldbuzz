import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import AgentsPage from "../agents/page";
import SourcesPage from "../sources/page";
import sitemap from "../sitemap";

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

  it("includes /sources and /agents in the sitemap", async () => {
    const entries = await sitemap();
    const urls = entries.map((entry) => entry.url);
    expect(urls).toContain("https://westfieldbuzz.com/sources");
    expect(urls).toContain("https://westfieldbuzz.com/agents");
  });

  it("links the new pages from llms.txt", () => {
    const llmsTxt = readFileSync(
      join(__dirname, "..", "..", "..", "public", "llms.txt"),
      "utf8",
    );
    expect(llmsTxt).toContain("https://westfieldbuzz.com/sources");
    expect(llmsTxt).toContain("https://westfieldbuzz.com/agents");
  });
});
