import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetDoc = vi.fn();

vi.mock("firebase/firestore", () => ({
  doc: vi.fn((_db, ...path) => path.join("/")),
  getDoc: (...args: unknown[]) => mockGetDoc(...args),
  getFirestore: vi.fn(),
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

import { isUserAdmin } from "../admin";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("isUserAdmin", () => {
  it("returns false for null email", async () => {
    expect(await isUserAdmin(null)).toBe(false);
  });

  it("returns false for undefined email", async () => {
    expect(await isUserAdmin(undefined)).toBe(false);
  });

  it("returns false for empty string email", async () => {
    expect(await isUserAdmin("")).toBe(false);
  });

  it("returns true when email is in allowlist", async () => {
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ allowlist: ["admin@example.com", "boss@example.com"] }),
    });

    expect(await isUserAdmin("admin@example.com")).toBe(true);
  });

  it("returns false when email is not in allowlist", async () => {
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ allowlist: ["admin@example.com"] }),
    });

    expect(await isUserAdmin("nobody@example.com")).toBe(false);
  });

  it("returns false when admin doc does not exist", async () => {
    mockGetDoc.mockResolvedValue({ exists: () => false });
    expect(await isUserAdmin("admin@example.com")).toBe(false);
  });

  it("returns false when allowlist field is missing", async () => {
    mockGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({}),
    });

    expect(await isUserAdmin("admin@example.com")).toBe(false);
  });

  it("returns false on Firestore error", async () => {
    mockGetDoc.mockRejectedValue(new Error("Network error"));
    expect(await isUserAdmin("admin@example.com")).toBe(false);
  });
});
