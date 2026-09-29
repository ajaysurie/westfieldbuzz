import { describe, expect, it } from "vitest";
import { buildOpenApi } from "@/lib/seo/openapi";
import { EVENT_CATEGORIES } from "@/lib/events/types";
import { FEEDBACK_REASONS } from "@/lib/feedback";

describe("buildOpenApi", () => {
  const spec = buildOpenApi();

  it("documents every public endpoint on the canonical origin", () => {
    expect(spec.servers[0]!.url).toBe("https://www.westfieldbuzz.com");
    expect(Object.keys(spec.paths)).toEqual(["/api/events", "/calendar.ics", "/api/feedback"]);
  });

  it("takes enums from the code that enforces them", () => {
    expect(spec.components.schemas.Event.properties.category.enum).toEqual([...EVENT_CATEGORIES]);
    expect(spec.paths["/api/feedback"].post.requestBody.content["application/json"].schema.properties.reason.enum)
      .toEqual(Object.keys(FEEDBACK_REASONS));
  });
});
