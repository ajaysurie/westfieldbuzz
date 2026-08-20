import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import SearchExperience from "../SearchExperience";

afterEach(() => vi.restoreAllMocks());

describe("SearchExperience", () => {
  it("runs a homepage query supplied in the URL", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          query: "Free this weekend",
          intent: {
            version: 1,
            timeZone: "America/New_York",
            dateWindow: null,
            timeOfDay: [],
            partyAges: [],
            categories: [],
            towns: [],
            maxDriveMinutes: null,
            budget: null,
            environment: null,
            registration: null,
            availability: [],
            accessibility: [],
            keywords: ["free"],
            exclusions: { categories: [], keywords: [] },
            ambiguities: [],
          },
          results: [],
          fallbackUsed: true,
          ambiguities: [],
          suggestions: [],
          meta: { matchedCount: 0, candidateCount: 0, durationMs: 3 },
        }),
        { status: 200 }
      )
    );
    render(<SearchExperience initialQuery="Free this weekend" />);
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      "/api/event-search",
      expect.objectContaining({ method: "POST" })
    ));
    expect(screen.getByDisplayValue("Free this weekend")).toBeInTheDocument();
    expect(await screen.findByText("No exact matches")).toBeInTheDocument();
  });
});
