import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock firebase/firestore before importing our module
const mockGetDocs = vi.fn();
const mockGetDoc = vi.fn();

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

import { getCommunityStats, getServices, getServiceById, recommendService, getSuggestions, submitSuggestion, approveSuggestion } from "../firestore";
import { setDoc, updateDoc, arrayUnion } from "firebase/firestore";

const mockSetDoc = vi.mocked(setDoc);
const mockUpdateDoc = vi.mocked(updateDoc);
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
  it("copies address to new service doc", async () => {
    await approveSuggestion({
      id: "sug-1",
      userId: "u1",
      businessName: "Test",
      category: "Plumber",
      address: "456 Oak Ave",
      phone: "555-1234",
      website: "",
      notes: "",
      status: "pending",
      suggestedAt: { seconds: 100, nanoseconds: 0 } as any,
    });
    // First setDoc call creates the service
    expect(mockSetDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ address: "456 Oak Ave", name: "Test" })
    );
  });
});
