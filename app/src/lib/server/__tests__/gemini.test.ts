import { describe, expect, it } from "vitest";
import { fastThinkingConfig } from "@/lib/server/gemini";

describe("fastThinkingConfig", () => {
  it("asks Gemini 3.x models for low thinking", () => {
    expect(fastThinkingConfig("gemini-3.7-flash")).toEqual({ thinkingConfig: { thinkingLevel: "low" } });
    expect(fastThinkingConfig("gemini-3-pro")).toEqual({ thinkingConfig: { thinkingLevel: "low" } });
  });

  it("sends nothing for other model families", () => {
    expect(fastThinkingConfig("gemini-2.5-flash")).toEqual({});
    expect(fastThinkingConfig("gemini-30-experimental")).toEqual({});
  });
});
