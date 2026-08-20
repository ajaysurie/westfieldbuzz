import { createHash, randomUUID } from "node:crypto";
import {
  FieldValue,
  Timestamp,
  type Firestore,
} from "firebase-admin/firestore";
import { safeFetchText, type FetchImplementation } from "./safe-fetch";

export interface DiscoverySeed {
  name: string;
  url: string;
  town: string;
  suggestedAdapter: string;
  trust: "first-party" | "aggregator" | "newsletter";
  notes: string;
}

export interface SourceCandidate {
  id: string;
  name: string;
  url: string;
  town: string;
  suggestedAdapter: string;
  trust: DiscoverySeed["trust"];
  notes: string;
  reviewStatus: "pending";
  enabled: false;
  checkedAt: string;
  reachable: boolean;
  evidence: {
    finalUrl?: string;
    contentType?: string;
    responseBytes?: number;
    pageTitle?: string;
    evidenceHash?: string;
    error?: string;
  };
}

export const DISCOVERY_SEEDS: DiscoverySeed[] = [
  {
    name: "Westfield Community Players",
    url: "https://westfieldcommunityplayers.ludus.com/index.php?sections=events",
    town: "Westfield",
    suggestedAdapter: "ludus",
    trust: "first-party",
    notes: "Community theater schedule",
  },
  {
    name: "Westfield Playhouse",
    url: "https://www.westfieldplayhouse.org/msp-season",
    town: "Westfield",
    suggestedAdapter: "html-or-json-ld",
    trust: "first-party",
    notes: "Main Street Productions season",
  },
  {
    name: "New Jersey Festival Orchestra",
    url: "https://www.njfestivalorchestra.org/concerts",
    town: "Westfield",
    suggestedAdapter: "html-or-json-ld",
    trust: "first-party",
    notes: "Concert schedule",
  },
  {
    name: "Westfield On Weekends",
    url: "https://www.westfieldonweekends.com/",
    town: "Westfield",
    suggestedAdapter: "html-or-json-ld",
    trust: "first-party",
    notes: "Community events",
  },
  {
    name: "Summit municipal calendar",
    url: "https://www.cityofsummit.org/calendar.aspx",
    town: "Summit",
    suggestedAdapter: "civicplus-ical",
    trust: "first-party",
    notes: "Identify approved calendar IDs before enrollment",
  },
  {
    name: "Reeves-Reed Arboretum",
    url: "https://www.reeves-reedarboretum.org/",
    town: "Summit",
    suggestedAdapter: "html-or-json-ld",
    trust: "first-party",
    notes: "Programs and seasonal events",
  },
  {
    name: "Trailside Nature and Science Center",
    url: "https://ucnj.org/trailside-nature-and-science-center/",
    town: "Mountainside",
    suggestedAdapter: "html-or-json-ld",
    trust: "first-party",
    notes: "Union County nature programs",
  },
  {
    name: "Westfield Recreation catalog",
    url: "https://secure.rec1.com/NJ/Westfield-nj/catalog",
    town: "Westfield",
    suggestedAdapter: "recdesk",
    trust: "first-party",
    notes: "Programs, not automatically public events",
  },
  {
    name: "Patch Westfield calendar",
    url: "https://patch.com/new-jersey/westfield/calendar",
    town: "Westfield",
    suggestedAdapter: "discovery-only",
    trust: "aggregator",
    notes: "Candidate leads only. Require organizer verification.",
  },
  {
    name: "TAPinto Westfield events",
    url: "https://www.tapinto.net/towns/westfield/events",
    town: "Westfield",
    suggestedAdapter: "discovery-only",
    trust: "aggregator",
    notes: "Candidate leads only. Require organizer verification.",
  },
  {
    name: "Dwell New Jersey This Weekend",
    url: "https://dwellnewjersey.com/this-weekend",
    town: "Westfield area",
    suggestedAdapter: "newsletter-inbox",
    trust: "newsletter",
    notes: "Requires dedicated inbox and evidence-backed parsing",
  },
];

function stableId(url: string): string {
  return createHash("sha256").update(new URL(url).toString()).digest("hex");
}

function pageTitle(body: string): string | undefined {
  const title = body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  return title?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export async function discoverSourceCandidates(input: {
  seeds?: DiscoverySeed[];
  now?: Date;
  fetchImpl?: FetchImplementation;
}): Promise<SourceCandidate[]> {
  const checkedAt = (input.now ?? new Date()).toISOString();
  const seeds = input.seeds ?? DISCOVERY_SEEDS;
  const candidates: SourceCandidate[] = [];

  for (const seed of seeds) {
    const host = new URL(seed.url).hostname;
    const allowedHosts = host.startsWith("www.")
      ? [host, host.slice(4)]
      : [host, `www.${host}`];
    const base = {
      id: stableId(seed.url),
      ...seed,
      reviewStatus: "pending" as const,
      enabled: false as const,
      checkedAt,
    };
    try {
      const response = await safeFetchText({
        url: seed.url,
        policy: {
          allowedHosts,
          expectedContentTypes: [
            "text/html",
            "application/xhtml+xml",
            "application/json",
            "text/plain",
          ],
          timeoutMs: 8_000,
          maxResponseBytes: 750_000,
        },
        fetchImpl: input.fetchImpl,
        maxRedirects: 2,
      });
      candidates.push({
        ...base,
        reachable: true,
        evidence: {
          finalUrl: response.finalUrl,
          contentType: response.contentType,
          responseBytes: response.bytes,
          pageTitle: pageTitle(response.text),
          evidenceHash: createHash("sha256")
            .update(response.text)
            .digest("hex"),
        },
      });
    } catch (error) {
      candidates.push({
        ...base,
        reachable: false,
        evidence: {
          error: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }
  return candidates;
}

export async function runDiscovery(input: {
  db: Firestore;
  write: boolean;
  runId?: string;
  now?: Date;
  fetchImpl?: FetchImplementation;
}) {
  const runId = input.runId ?? randomUUID();
  const now = input.now ?? new Date();
  const runRef = input.db.collection("crawlRuns").doc(runId);
  if (input.write) {
    await runRef.set({
      mode: "discovery",
      status: "running",
      startedAt: Timestamp.fromDate(now),
    });
  }

  let candidates: SourceCandidate[];
  try {
    candidates = await discoverSourceCandidates({
      now,
      fetchImpl: input.fetchImpl,
    });
  } catch (error) {
    if (input.write) {
      await runRef.set(
        {
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
          finishedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }
    throw error;
  }

  const unreachable = candidates.filter((candidate) => !candidate.reachable).length;
  const status =
    unreachable === 0
      ? "success"
      : unreachable === candidates.length
        ? "failed"
        : "partial";
  if (input.write) {
    const candidateRefs = candidates.map((candidate) =>
      input.db.collection("sourceCandidates").doc(candidate.id)
    );
    const existing = await input.db.getAll(...candidateRefs);
    const existingIds = new Set(
      existing.filter((snapshot) => snapshot.exists).map((snapshot) => snapshot.id)
    );
    for (let index = 0; index < candidates.length; index += 400) {
      const batch = input.db.batch();
      for (const candidate of candidates.slice(index, index + 400)) {
        batch.set(
          input.db.collection("sourceCandidates").doc(candidate.id),
          {
            ...candidate,
            ...(!existingIds.has(candidate.id)
              ? { firstSeenAt: FieldValue.serverTimestamp() }
              : {}),
            lastCheckedAt: Timestamp.fromDate(now),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }
      await batch.commit();
    }
    await runRef.set(
      {
        status,
        candidateCount: candidates.length,
        reachable: candidates.filter((candidate) => candidate.reachable).length,
        unreachable,
        finishedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }
  return { runId, status, candidates };
}
