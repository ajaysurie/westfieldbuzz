import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock firebase/firestore before importing our module
const mockGetDocs = vi.fn();

vi.mock("firebase/firestore", () => ({
  collection: vi.fn((_db, name) => name),
  doc: vi.fn((_db, ...path) => path.length ? path.join("/") : { id: "generated-document-id" }),
  getDoc: vi.fn(),
  getDocs: (...args: unknown[]) => mockGetDocs(...args),
  setDoc: vi.fn(),
  deleteDoc: vi.fn(),
  updateDoc: vi.fn(),
  increment: vi.fn((n) => n),
  serverTimestamp: vi.fn(() => null),
  query: vi.fn((...args) => args),
  orderBy: vi.fn(),
  where: vi.fn(),
  documentId: vi.fn(() => "__name__"),
  limit: vi.fn((value) => ({ limit: value })),
  arrayUnion: vi.fn(),
  arrayRemove: vi.fn(),
  writeBatch: vi.fn(() => ({
    set: vi.fn(),
    update: vi.fn(),
    commit: vi.fn().mockResolvedValue(undefined),
  })),
  getFirestore: vi.fn(),
  initializeApp: vi.fn(),
  getApps: vi.fn(() => [{}]),
}));

vi.mock("firebase/app", () => ({
  initializeApp: vi.fn(),
  getApps: vi.fn(() => [{}]),
}));

vi.mock("firebase/auth", () => {
  class MockFacebookAuthProvider { addScope() {} }
  class MockGoogleAuthProvider {}
  return {
    getAuth: vi.fn(),
    FacebookAuthProvider: MockFacebookAuthProvider,
    GoogleAuthProvider: MockGoogleAuthProvider,
  };
});

import { createEvent, getPublicEvents, getPublishedEventById, MAX_PUBLIC_EVENT_LIMIT, getSourceHealth, getPendingEventCandidates } from "../firestore";
import { setDoc, documentId, limit, orderBy, where } from "firebase/firestore";

const mockSetDoc = vi.mocked(setDoc);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("public event reads", () => {
  it("queries only published events within the requested category/date range and cap", async () => {
    mockGetDocs.mockResolvedValue({
      docs: [{ id: "event-1", data: () => ({
        title: "Storytime",
        category: "Family",
        status: "weather-dependent",
        availability: "unknown",
        freshnessStatus: "current",
        lastVerifiedAt: { toDate: () => new Date() },
      }) }],
    });
    const from = new Date("2026-08-20T00:00:00.000Z");
    const to = new Date("2026-08-28T23:59:59.999Z");

    const events = await getPublicEvents({ from, to, category: "Family", limit: 9999 });

    expect(where).toHaveBeenCalledWith("publicationStatus", "==", "published");
    expect(where).toHaveBeenCalledWith("date", ">=", from);
    expect(where).toHaveBeenCalledWith("date", "<=", to);
    expect(where).toHaveBeenCalledWith("category", "==", "Family & Kids");
    expect(orderBy).toHaveBeenCalledWith("date", "asc");
    expect(limit).toHaveBeenCalledWith(MAX_PUBLIC_EVENT_LIMIT);
    expect(events[0]).toMatchObject({
      category: "Family & Kids",
      status: "weather-dependent",
    });
  });

  it("returns null for a missing or unpublished detail without a direct document read", async () => {
    mockGetDocs.mockResolvedValue({ docs: [] });

    await expect(getPublishedEventById("draft")).resolves.toBeNull();
    expect(documentId).toHaveBeenCalled();
    expect(where).toHaveBeenCalledWith("__name__", "==", "draft");
    expect(where).toHaveBeenCalledWith("publicationStatus", "==", "published");
  });
});

describe("admin operational reads", () => {
  it("returns source health sorted by source name", async () => {
    mockGetDocs.mockResolvedValue({
      docs: [
        { id: "z", data: () => ({ sourceId: "z", sourceName: "Zebra source" }) },
        { id: "a", data: () => ({ sourceId: "a", sourceName: "Alpha source" }) },
      ],
    });

    await expect(getSourceHealth()).resolves.toMatchObject([
      { id: "a", sourceName: "Alpha source" },
      { id: "z", sourceName: "Zebra source" },
    ]);
  });

  it("limits review queue reads to pending candidates and orders by event date", async () => {
    mockGetDocs.mockResolvedValue({
      docs: [
        { id: "later", data: () => ({ title: "Later", date: { seconds: 20 }, reviewStatus: "pending" }) },
        { id: "first", data: () => ({ title: "First", date: { seconds: 10 }, reviewStatus: "pending" }) },
      ],
    });

    await expect(getPendingEventCandidates()).resolves.toMatchObject([
      { id: "first", title: "First" },
      { id: "later", title: "Later" },
    ]);
    expect(where).toHaveBeenCalledWith("reviewStatus", "==", "pending");
  });
});

describe("createEvent", () => {
  it("creates a published manual projection with explicit manual provenance", async () => {
    await createEvent({
      title: "Town Hall", description: "", date: new Date(), endDate: null,
      location: "Town Hall", category: "Community", createdBy: "admin-1",
    });

    expect(mockSetDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        publicationStatus: "published",
        freshnessStatus: "current",
        status: "scheduled",
        availability: "unknown",
        sourceId: "manual-admin",
        sourceEventId: expect.any(String),
      })
    );
  });
});
