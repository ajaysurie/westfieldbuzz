import { afterEach, describe, expect, it } from "vitest";
import { trustedClientIp } from "../search-rate-limit";

const originalNodeEnv = process.env.NODE_ENV;

function setNodeEnv(value: string | undefined) {
  Object.defineProperty(process.env, "NODE_ENV", {
    value,
    configurable: true,
    writable: true,
    enumerable: true,
  });
}

afterEach(() => {
  setNodeEnv(originalNodeEnv);
});

describe("event search client identity", () => {
  it("ignores spoofed generic forwarding in production", () => {
    setNodeEnv("production");
    const request = new Request("https://westfieldbuzz.com/api/event-search", {
      headers: { "x-forwarded-for": "203.0.113.99" },
    });

    expect(trustedClientIp(request)).toBe("unknown");
  });

  it("uses Vercel's canonical forwarding value and bounds it before hashing", () => {
    setNodeEnv("production");
    const request = new Request("https://westfieldbuzz.com/api/event-search", {
      headers: {
        "x-vercel-forwarded-for": ` 2001:db8::1, proxy, ${"x".repeat(300)} `,
        "x-forwarded-for": "203.0.113.99",
      },
    });

    expect(trustedClientIp(request)).toBe("2001:db8::1");
  });
});
