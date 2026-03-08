import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock firebase/firestore before importing our module
const mockGetDocs = vi.fn();
const mockGetDoc = vi.fn();
const mockBatchSet = vi.fn();
const mockBatchUpdate = vi.fn();
const mockBatchCommit = vi.fn().mockResolvedValue(undefined);

vi.mock("firebase/firestore", () => ({
  collection: vi.fn((_db, name) => name),
  doc: vi.fn((_db, ...path) => path.join("/")),
  getDoc: (...args: unknown[]) => mockGetDoc(...args),
  getDocs: (...args: unknown[]) => mockGetDocs(...args),
  setDoc: vi.fn(),
  deleteDoc: vi.fn(),
  updateDoc: vi.fn(),
  increment: vi.fn((n) => n),
  serverTimestamp: vi.fn(() => null),
  query: vi.fn((...args) => args),
  orderBy: vi.fn(),
  where: vi.fn(),
  arrayUnion: vi.fn(),
  arrayRemove: vi.fn(),
  writeBatch: vi.fn(() => ({
    set: mockBatchSet,
    update: mockBatchUpdate,
    commit: mockBatchCommit,
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
  return {
    getAuth: vi.fn(),
    FacebookAuthProvider: MockFacebookAuthProvider,
  };
});

import { getCommunityStats, getServices, getServiceById, recommendService, unrecommendService, getSuggestions, submitSuggestion, approveSuggestion, rejectSuggestion } from "../firestore";
import { setDoc, updateDoc, deleteDoc, arrayUnion, type Timestamp } from "firebase/firestore";

const mockSetDoc = vi.mocked(setDoc);
const mockUpdateDoc = vi.mocked(updateDoc);
const mockDeleteDoc = vi.mocked(deleteDoc);
const mockArrayUnion = vi.mocked(arrayUnion);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getCommunityStats", () => {
  it("counts providers, sums recommendations, counts unique recommenders", async () => {
    mockGetDocs.mockResolvedValue({
      size: 3,
      docs: [
        { data: () => ({ recommendations: 5, recentRecommenders: ["Alice", "Bob"] }) },
        { data: () => ({ recommendations: 3, recentRecommenders: ["Alice", "Carol"] }) },
        { data: () => ({ recommendations: 0, recentRecommenders: [] }) },
      ],
    });

    const stats = await getCommunityStats();
    expect(stats.providers).toBe(3);
    expect(stats.recommendations).toBe(8);
    expect(stats.recommenders).toBe(3); // Alice, Bob, Carol (Alice deduped)
  });

  it("handles empty collection", async () => {
    mockGetDocs.mockResolvedValue({ size: 0, docs: [] });
    const stats = await getCommunityStats();
    expect(stats).toEqual({ providers: 0, recommendations: 0, recommenders: 0 });
  });

  it("handles missing fields gracefully", async () => {
    mockGetDocs.mockResolvedValue({
      size: 1,
      docs: [{ data: () => ({}) }],
    });

    const stats = await getCommunityStats();
    expect(stats.providers).toBe(1);
    expect(stats.recommendations).toBe(0);
    expect(stats.recommenders).toBe(0);
  });

  it("ignores non-string recommenders (object entries)", async () => {
    mockGetDocs.mockResolvedValue({
      size: 1,
      docs: [
        {
          data: () => ({
            recommendations: 2,
            recentRecommenders: ["Alice", { uid: "u1", timestamp: {} }],
          }),
        },
      ],
    });

    const stats = await getCommunityStats();
    expect(stats.recommenders).toBe(1); // only "Alice"
  });
});

describe("getServices", () => {
  it("returns services sorted by recommendations desc", async () => {
    mockGetDocs.mockResolvedValue({
      docs: [
        { id: "a", data: () => ({ name: "Low", recommendations: 1 }) },
        { id: "b", data: () => ({ name: "High", recommendations: 10 }) },
        { id: "c", data: () => ({ name: "Mid", recommendations: 5 }) },
      ],
    });

    const services = await getServices();
    expect(services[0].name).toBe("High");
    expect(services[1].name).toBe("Mid");
    expect(services[2].name).toBe("Low");
  });

  it("returns empty array for empty collection", async () => {
    mockGetDocs.mockResolvedValue({ docs: [] });
    const services = await getServices();
    expect(services).toEqual([]);
  });
});

describe("getServiceById", () => {
  it("returns service when found", async () => {
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      id: "abc",
      data: () => ({ name: "Test Service", category: "Plumber" }),
    });

    const service = await getServiceById("abc");
    expect(service).not.toBeNull();
    expect(service!.name).toBe("Test Service");
    expect(service!.id).toBe("abc");
  });

  it("returns null when not found", async () => {
    mockGetDoc.mockResolvedValue({ exists: () => false });
    const service = await getServiceById("missing");
    expect(service).toBeNull();
  });
});

describe("recommendService", () => {
  it("stores displayName when provided", async () => {
    await recommendService("svc-1", "user-1", "Alice Smith");
    expect(mockSetDoc).toHaveBeenCalled();
    expect(mockUpdateDoc).toHaveBeenCalled();
    expect(mockArrayUnion).toHaveBeenCalledWith(
      expect.objectContaining({ uid: "user-1", displayName: "Alice Smith" })
    );
  });

  it("stores null displayName when not provided", async () => {
    await recommendService("svc-1", "user-1");
    expect(mockArrayUnion).toHaveBeenCalledWith(
      expect.objectContaining({ uid: "user-1", displayName: null })
    );
  });
});

describe("getSuggestions", () => {
  it("returns suggestions sorted by suggestedAt", async () => {
    mockGetDocs.mockResolvedValue({
      docs: [
        { id: "s1", data: () => ({ businessName: "A", status: "pending", suggestedAt: { seconds: 100 } }) },
        { id: "s2", data: () => ({ businessName: "B", status: "pending", suggestedAt: { seconds: 200 } }) },
      ],
    });

    const suggestions = await getSuggestions("pending");
    expect(suggestions).toHaveLength(2);
  });

  it("falls back to unordered query on error", async () => {
    // First call (with orderBy) fails, second call (without) succeeds
    mockGetDocs
      .mockRejectedValueOnce(new Error("Missing composite index"))
      .mockResolvedValueOnce({
        docs: [
          { id: "s1", data: () => ({ businessName: "A", status: "pending", suggestedAt: { seconds: 100 } }) },
          { id: "s2", data: () => ({ businessName: "B", status: "pending", suggestedAt: { seconds: 200 } }) },
        ],
      });

    const suggestions = await getSuggestions("pending");
    expect(suggestions).toHaveLength(2);
    // Should be sorted desc by suggestedAt (client-side)
    expect(suggestions[0].id).toBe("s2");
    expect(suggestions[1].id).toBe("s1");
  });
});

describe("submitSuggestion", () => {
  it("stores address field", async () => {
    await submitSuggestion({
      userId: "u1",
      businessName: "Test Biz",
      category: "Plumber",
      address: "123 Elm St",
      phone: "",
      website: "",
      notes: "",
    });
    expect(mockSetDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ address: "123 Elm St", businessName: "Test Biz" })
    );
  });
});

describe("approveSuggestion", () => {
  const suggestion = {
    id: "sug-1",
    userId: "u1",
    businessName: "Test",
    category: "Plumber",
    address: "456 Oak Ave",
    phone: "555-1234",
    website: "https://test.com",
    notes: "Great plumber!",
    status: "pending" as const,
    suggestedAt: { seconds: 100, nanoseconds: 0 } as unknown as Timestamp,
  };

  it("copies all fields to new service doc", async () => {
    await approveSuggestion(suggestion);
    expect(mockBatchSet).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        name: "Test",
        category: "Plumber",
        address: "456 Oak Ave",
        phone: "555-1234",
        website: "https://test.com",
        email: "",
      })
    );
  });

  it("creates service with submitter's recommendation counted", async () => {
    await approveSuggestion(suggestion);
    expect(mockBatchSet).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        recommendations: 1,
        recentRecommenders: [expect.objectContaining({ uid: "u1" })],
      })
    );
  });

  it("writes submitter to recommendations subcollection", async () => {
    await approveSuggestion(suggestion);
    expect(mockBatchSet).toHaveBeenCalledWith(
      expect.stringContaining("recommendations"),
      expect.objectContaining({ uid: "u1" })
    );
  });

  it("marks suggestion as approved", async () => {
    await approveSuggestion(suggestion);
    expect(mockBatchUpdate).toHaveBeenCalledWith(
      expect.stringContaining("sug-1"),
      { status: "approved" }
    );
  });

  it("defaults empty address to empty string", async () => {
    await approveSuggestion({ ...suggestion, address: "" });
    expect(mockBatchSet).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ address: "" })
    );
  });

  it("uses atomic batch write (2 sets + 1 update + commit)", async () => {
    await approveSuggestion(suggestion);
    expect(mockBatchSet).toHaveBeenCalledTimes(2); // service + subcollection
    expect(mockBatchUpdate).toHaveBeenCalledTimes(1); // status update
    expect(mockBatchCommit).toHaveBeenCalledTimes(1);
  });

  it("does not copy notes, userId, or suggestedAt to service doc", async () => {
    await approveSuggestion(suggestion);
    const serviceDocData = mockBatchSet.mock.calls[0][1];
    expect(serviceDocData).not.toHaveProperty("notes");
    expect(serviceDocData).not.toHaveProperty("userId");
    expect(serviceDocData).not.toHaveProperty("suggestedAt");
  });
});

describe("rejectSuggestion", () => {
  it("marks suggestion as rejected", async () => {
    await rejectSuggestion("sug-2");
    expect(mockUpdateDoc).toHaveBeenCalledWith(
      expect.stringContaining("sug-2"),
      { status: "rejected" }
    );
  });
});

describe("unrecommendService", () => {
  it("deletes recommendation and decrements count when recommendation exists", async () => {
    mockGetDoc.mockResolvedValue({ exists: () => true, data: () => ({ uid: "u1" }) });
    await unrecommendService("svc-1", "u1");
    expect(mockDeleteDoc).toHaveBeenCalled();
    expect(mockUpdateDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ recommendations: -1 })
    );
  });

  it("does not decrement count when recommendation does not exist", async () => {
    mockGetDoc.mockResolvedValue({ exists: () => false });
    await unrecommendService("svc-1", "u1");
    expect(mockDeleteDoc).toHaveBeenCalled();
    expect(mockUpdateDoc).not.toHaveBeenCalled();
  });
});
