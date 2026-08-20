import { normalizeCategory } from "@/lib/events/normalize";
import { isWithinVerificationAge } from "@/lib/events/freshness";
import type {
  EventQueryWindow,
  EventRepository,
  SearchableEvent,
} from "@/lib/search/event-retrieval";

export class EventRepositoryConfigurationError extends Error {
  constructor() {
    super("event-repository-not-configured");
    this.name = "EventRepositoryConfigurationError";
  }
}

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof value.toDate === "function"
  ) {
    return value.toDate();
  }
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.valueOf()) ? null : parsed;
  }
  return null;
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").slice(0, 30)
    : [];
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function factEvidence(value: unknown): SearchableEvent["factEvidence"] {
  if (!value || typeof value !== "object") return {};
  const record = value as Record<string, unknown>;
  const names = ["age", "cost", "environment", "registration", "accessibility", "travelTime"] as const;
  return Object.fromEntries(names.flatMap((name) =>
    record[name] === "known" || record[name] === "unknown"
      ? [[name, record[name]]]
      : []
  )) as SearchableEvent["factEvidence"];
}

function mapEvent(id: string, data: Record<string, unknown>): SearchableEvent | null {
  const date = toDate(data.date);
  const verified = toDate(data.lastVerifiedAt);
  if (!date || !verified || typeof data.title !== "string") {
    return null;
  }
  const cost = data.cost && typeof data.cost === "object"
    ? (data.cost as Record<string, unknown>)
    : null;
  const age = data.ageRange && typeof data.ageRange === "object"
    ? (data.ageRange as Record<string, unknown>)
    : null;
  const environment = data.environment === "indoor" || data.environment === "outdoor"
    ? data.environment
    : null;
  const registration = data.registration === "required" || data.registration === "drop-in"
    ? data.registration
    : null;
  const costAmount = finiteNumber(data.costAmount) ?? finiteNumber(cost?.amount);
  const isFree = typeof data.isFree === "boolean"
    ? data.isFree
    : cost?.type === "free"
      ? true
      : costAmount != null
        ? costAmount === 0
        : null;

  const mapped: SearchableEvent = {
    id,
    title: data.title,
    description: typeof data.description === "string" ? data.description : "",
    date: date.toISOString(),
    endDate: toDate(data.endDate)?.toISOString() ?? null,
    location: typeof data.location === "string" ? data.location : "",
    town: typeof data.town === "string" ? data.town : "",
    category: normalizeCategory(typeof data.category === "string" ? data.category : undefined),
    status: data.status === "rescheduled" ? "rescheduled"
      : data.status === "cancelled" ? "cancelled"
      : data.status === "postponed" ? "postponed"
      : data.status === "weather-dependent" ? "weather-dependent"
      : "scheduled",
    availability: data.availability === "available" || data.availability === "registration-required" || data.availability === "waitlist" || data.availability === "sold-out" ? data.availability : "unknown",
    publicationStatus: "published",
    freshnessStatus: data.freshnessStatus === "stale" || data.freshnessStatus === "missing" ? data.freshnessStatus : "current",
    // Manual events have operator verification instead of an invented source URL.
    sourceUrl: typeof data.sourceUrl === "string" ? data.sourceUrl : "",
    sourceId: typeof data.sourceId === "string" ? data.sourceId : "",
    lastVerifiedAt: verified.toISOString(),
    tags: strings(data.tags),
    minAge: finiteNumber(data.minAge) ?? finiteNumber(age?.min),
    maxAge: finiteNumber(data.maxAge) ?? finiteNumber(age?.max),
    costAmount,
    isFree,
    environment,
    registration,
    accessibility: strings(data.accessibility),
    driveMinutes: finiteNumber(data.driveMinutes),
    factEvidence: factEvidence(data.factEvidence),
  };
  return isWithinVerificationAge(verified) ? mapped : null;
}

async function createDatabase() {
  const projectId = process.env.FIREBASE_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const hasApplicationDefault = Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS);
  if (!projectId || (!hasApplicationDefault && (!clientEmail || !privateKey))) {
    throw new EventRepositoryConfigurationError();
  }

  const [{ applicationDefault, cert, getApps, initializeApp }, { getFirestore }] = await Promise.all([
    import("firebase-admin/app"),
    import("firebase-admin/firestore"),
  ]);
  const app = getApps().find((candidate) => candidate.name === "westfieldbuzz-search") ?? initializeApp(
    {
      credential: hasApplicationDefault
        ? applicationDefault()
        : cert({ projectId, clientEmail, privateKey }),
      projectId,
    },
    "westfieldbuzz-search"
  );
  return getFirestore(app, process.env.NEXT_PUBLIC_FIRESTORE_DB || "westfieldbuzz-dev");
}

export function createFirestoreEventRepository(): EventRepository {
  return {
    async listPublishedEvents(window: EventQueryWindow) {
      const { Timestamp } = await import("firebase-admin/firestore");
      const db = await createDatabase();
      const snapshot = await db
        .collection("events")
        .where("publicationStatus", "==", "published")
        .where("date", ">=", Timestamp.fromDate(window.from))
        .where("date", "<=", Timestamp.fromDate(window.to))
        .orderBy("date", "asc")
        .limit(window.limit)
        .get();
      return snapshot.docs
        .map((document) => mapEvent(document.id, document.data()))
        .filter((event): event is SearchableEvent => event !== null);
    },
  };
}
