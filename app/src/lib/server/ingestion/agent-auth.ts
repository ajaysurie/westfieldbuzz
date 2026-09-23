import { timingSafeEqual } from "node:crypto";

/**
 * Shared-secret auth for the machine-to-machine agent ingest endpoint.
 *
 * A single site operator provisions `AGENT_INGEST_KEY` (a long random token)
 * in the deployment environment and hands it to the trusted automation that
 * pushes pre-curated events. Verification is timing-safe and the key is never
 * logged or echoed back.
 */
export type AgentIngestAuthResult = "ok" | "not-configured" | "unauthorized";

export function agentIngestKeyConfigured(): boolean {
  return Boolean(process.env.AGENT_INGEST_KEY?.trim());
}

export function authorizeAgentIngest(request: Request): AgentIngestAuthResult {
  if (!agentIngestKeyConfigured()) return "not-configured";
  const header = request.headers.get("authorization") ?? "";
  const token = /^Bearer (.+)$/.exec(header)?.[1]?.trim() ?? "";
  if (!token) return "unauthorized";
  const expected = process.env.AGENT_INGEST_KEY!.trim();
  const provided = Buffer.from(token, "utf8");
  const wanted = Buffer.from(expected, "utf8");
  return provided.length === wanted.length && timingSafeEqual(provided, wanted)
    ? "ok"
    : "unauthorized";
}
