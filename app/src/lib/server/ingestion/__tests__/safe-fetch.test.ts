import { describe, expect, it, vi } from "vitest";
import { assertApprovedUrl, safeFetchText } from "../safe-fetch";

const policy = {
  allowedHosts: ["events.example.com"],
  expectedContentTypes: ["application/json"],
  timeoutMs: 100,
  maxResponseBytes: 100,
};

describe("safeFetchText", () => {
  it("reads a bounded response from an explicitly approved host", async () => {
    const result = await safeFetchText({
      url: "https://events.example.com/feed",
      policy,
      fetchImpl: async () =>
        new Response('{"events":[]}', {
          headers: { "content-type": "application/json; charset=utf-8" },
        }),
    });
    expect(result.text).toBe('{"events":[]}');
    expect(result.bytes).toBe(13);
  });

  it("blocks unapproved hosts, URL credentials, and non-HTTPS URLs", () => {
    expect(() => assertApprovedUrl("https://evil.example/feed", policy.allowedHosts)).toThrow(
      "unapproved source host"
    );
    expect(() => assertApprovedUrl("https://user:pass@events.example.com/feed", policy.allowedHosts)).toThrow(
      "credentials"
    );
    expect(() => assertApprovedUrl("http://events.example.com/feed", policy.allowedHosts)).toThrow(
      "non-HTTPS"
    );
  });

  it("validates every redirect host", async () => {
    await expect(
      safeFetchText({
        url: "https://events.example.com/feed",
        policy,
        fetchImpl: async () =>
          new Response(null, {
            status: 302,
            headers: { location: "https://evil.example/feed" },
          }),
      })
    ).rejects.toThrow("unapproved source host");
  });

  it("rejects unexpected content types and oversized bodies", async () => {
    await expect(
      safeFetchText({
        url: "https://events.example.com/feed",
        policy,
        fetchImpl: async () =>
          new Response("<html></html>", {
            headers: { "content-type": "text/html" },
          }),
      })
    ).rejects.toThrow("Unexpected source content type");

    await expect(
      safeFetchText({
        url: "https://events.example.com/feed",
        policy,
        fetchImpl: async () =>
          new Response("x".repeat(101), {
            headers: { "content-type": "application/json" },
          }),
      })
    ).rejects.toThrow("byte limit");
  });

  it("aborts a request that exceeds its source timeout", async () => {
    vi.useFakeTimers();
    const pending = safeFetchText({
      url: "https://events.example.com/feed",
      policy: { ...policy, timeoutMs: 10 },
      fetchImpl: (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    });
    const assertion = expect(pending).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(11);
    await assertion;
    vi.useRealTimers();
  });

  it("shares one global deadline across redirects and body reads", async () => {
    vi.useFakeTimers();
    let calls = 0;
    const pending = safeFetchText({
      url: "https://events.example.com/feed",
      policy: { ...policy, timeoutMs: 100 },
      deadlineAt: new Date(Date.now() + 10),
      fetchImpl: (_url, init) => {
        calls += 1;
        if (calls === 1) {
          return Promise.resolve(new Response(null, {
            status: 302,
            headers: { location: "/redirected" },
          }));
        }
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        });
      },
    });
    const assertion = expect(pending).rejects.toThrow("Global crawl deadline exceeded");
    await vi.advanceTimersByTimeAsync(11);
    await assertion;
    expect(calls).toBe(2);
    vi.useRealTimers();
  });

  it("applies the same deadline while a response body is still streaming", async () => {
    vi.useFakeTimers();
    const pending = safeFetchText({
      url: "https://events.example.com/feed",
      policy: { ...policy, timeoutMs: 100 },
      deadlineAt: new Date(Date.now() + 10),
      fetchImpl: async () => new Response(new ReadableStream<Uint8Array>({
        pull() { return new Promise(() => undefined); },
      }), { headers: { "content-type": "application/json" } }),
    });
    const assertion = expect(pending).rejects.toThrow("Global crawl deadline exceeded");
    await vi.advanceTimersByTimeAsync(11);
    await assertion;
    vi.useRealTimers();
  });
});
