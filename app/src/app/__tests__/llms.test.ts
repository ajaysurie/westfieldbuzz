import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const llmsTxt = readFileSync(join(__dirname, "..", "..", "..", "public", "llms.txt"), "utf8");

describe("public/llms.txt", () => {
  it("describes the events product, not the retired service directory", () => {
    expect(llmsTxt.toLowerCase()).not.toContain("service directory");
    expect(llmsTxt.toLowerCase()).not.toContain("service provider");
    expect(llmsTxt).toContain("events");
  });

  it("documents the machine-readable endpoints agents should use", () => {
    expect(llmsTxt).toContain("/api/events");
    expect(llmsTxt).toContain("/events/[id]");
    expect(llmsTxt).toContain("JSON-LD");
  });
});
