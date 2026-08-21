import { describe, expect, it } from "vitest";
import { hasValidCronAuthorization } from "./auth";

describe("Friday digest cron authorization", () => {
  it("only accepts the configured bearer secret", () => {
    const authorized = new Request("https://westfieldbuzz.com/api/cron/friday-digest", {
      headers: { authorization: "Bearer cron-secret" },
    });
    const missing = new Request("https://westfieldbuzz.com/api/cron/friday-digest");
    const wrong = new Request("https://westfieldbuzz.com/api/cron/friday-digest", {
      headers: { authorization: "Bearer wrong" },
    });

    expect(hasValidCronAuthorization(authorized, "cron-secret")).toBe(true);
    expect(hasValidCronAuthorization(missing, "cron-secret")).toBe(false);
    expect(hasValidCronAuthorization(wrong, "cron-secret")).toBe(false);
    expect(hasValidCronAuthorization(authorized, "")).toBe(false);
  });
});
