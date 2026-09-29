import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

describe("next.config", () => {
  it("does not reuse Turbopack's cached build output", () => {
    // A restored cache once shipped an old stylesheet with new pages.
    expect(nextConfig.experimental?.turbopackFileSystemCacheForBuild).toBe(false);
  });
});
