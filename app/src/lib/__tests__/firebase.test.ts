import { describe, it, expect, vi } from "vitest";

vi.mock("firebase/app", () => ({
  initializeApp: vi.fn(),
  getApps: vi.fn(() => [{}]),
}));

vi.mock("firebase/firestore", () => ({
  getFirestore: vi.fn(() => ({ type: "firestore" })),
}));

vi.mock("firebase/auth", () => {
  class MockFacebookAuthProvider { addScope() {} }
  class MockGoogleAuthProvider {}
  return {
    getAuth: vi.fn(() => ({ type: "auth" })),
    FacebookAuthProvider: MockFacebookAuthProvider,
    GoogleAuthProvider: MockGoogleAuthProvider,
  };
});

import { auth, db, facebookProvider, googleProvider } from "../firebase";

describe("firebase exports", () => {
  it("exports auth instance", () => {
    expect(auth).toBeDefined();
  });

  it("exports db instance", () => {
    expect(db).toBeDefined();
  });

  it("exports facebookProvider", () => {
    expect(facebookProvider).toBeDefined();
  });

  it("exports googleProvider", () => {
    expect(googleProvider).toBeDefined();
  });

  it("googleProvider is a GoogleAuthProvider instance", () => {
    expect(googleProvider.constructor.name).toBe("MockGoogleAuthProvider");
  });

  it("facebookProvider is a FacebookAuthProvider instance", () => {
    expect(facebookProvider.constructor.name).toBe("MockFacebookAuthProvider");
  });
});
