import type { EventSourcePolicy } from "./types";

export interface SafeFetchResponse {
  text: string;
  contentType: string;
  bytes: number;
  finalUrl: string;
}

export type FetchImplementation = typeof fetch;

function normalizeHost(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/\.$/, "");
}

export function assertApprovedUrl(url: string, allowedHosts: string[]): URL {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") {
    throw new Error(`Blocked non-HTTPS source URL for ${parsed.hostname}`);
  }

  const allowed = new Set(allowedHosts.map(normalizeHost));
  if (!allowed.has(normalizeHost(parsed.hostname))) {
    throw new Error(`Blocked unapproved source host: ${parsed.hostname}`);
  }
  if (parsed.username || parsed.password) {
    throw new Error("Blocked source URL containing credentials");
  }
  return parsed;
}

function acceptedContentType(actual: string, expected: string[]): boolean {
  const mime = actual.split(";", 1)[0].trim().toLowerCase();
  return expected.some((candidate) => mime === candidate.toLowerCase());
}

async function readBoundedBody(
  response: Response,
  maxBytes: number
): Promise<{ text: string; bytes: number }> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new Error(
      `Source response exceeds ${maxBytes} byte limit (${declaredLength} declared)`
    );
  }

  if (!response.body) return { text: "", bytes: 0 };
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maxBytes) {
      await reader.cancel();
      throw new Error(`Source response exceeds ${maxBytes} byte limit`);
    }
    chunks.push(value);
  }

  const body = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { text: new TextDecoder().decode(body), bytes };
}

export async function safeFetchText(input: {
  url: string;
  policy: Pick<
    EventSourcePolicy,
    | "allowedHosts"
    | "expectedContentTypes"
    | "timeoutMs"
    | "maxResponseBytes"
  >;
  fetchImpl?: FetchImplementation;
  maxRedirects?: number;
}): Promise<SafeFetchResponse> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const maxRedirects = input.maxRedirects ?? 3;
  let current = assertApprovedUrl(input.url, input.policy.allowedHosts);

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), input.policy.timeoutMs);
    try {
      const response = await fetchImpl(current, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          Accept: input.policy.expectedContentTypes.join(", "),
          "User-Agent": "WestfieldBuzz/1.0 (+https://westfieldbuzz.com)",
        },
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) throw new Error(`Source redirect ${response.status} had no location`);
        if (redirectCount === maxRedirects) {
          throw new Error(`Source exceeded ${maxRedirects} redirects`);
        }
        current = assertApprovedUrl(
          new URL(location, current).toString(),
          input.policy.allowedHosts
        );
        continue;
      }

      if (!response.ok) {
        throw new Error(`Source returned HTTP ${response.status}`);
      }

      const contentType = response.headers.get("content-type") ?? "";
      if (!acceptedContentType(contentType, input.policy.expectedContentTypes)) {
        throw new Error(
          `Unexpected source content type: ${contentType || "missing"}`
        );
      }
      const body = await readBoundedBody(response, input.policy.maxResponseBytes);
      return {
        ...body,
        contentType,
        finalUrl: current.toString(),
      };
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error(`Source request timed out after ${input.policy.timeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error("Source redirect handling failed");
}
