import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup } from "@testing-library/react";

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockLogout = vi.fn();
let mockAuthState: Record<string, unknown> = {};

vi.mock("@/lib/auth", () => ({
  useAuth: () => mockAuthState,
}));

// Mock AuthGate to just render children (user is always authed in these tests)
vi.mock("@/components/AuthGate", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import AccountPage from "../account/page";

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  mockAuthState = {
    user: {
      uid: "u1",
      displayName: "Test User",
      email: "test@example.com",
      providerData: [{ providerId: "google.com" }],
    },
    photoURL: "https://example.com/photo.jpg",
    loading: false,
    authError: "",
    logout: mockLogout,
  };
});

vi.mock("@/lib/personalization", () => ({
  EMPTY_PREFERENCES: {
    towns: ["Westfield"], driveMinutes: 20, childAges: [], interests: [], indoorPreference: "either", budgetMax: null, personalizeFriday: false,
  },
  getPreferences: vi.fn().mockResolvedValue({
    towns: ["Westfield"], driveMinutes: 20, childAges: [], interests: [], indoorPreference: "either", budgetMax: null, personalizeFriday: false,
  }),
  savePreferences: vi.fn().mockResolvedValue(undefined),
}));

describe("AccountPage — preferences", () => {
  it("shows Google as a linked provider", () => {
    const { container } = render(<AccountPage />);
    expect(container).toHaveTextContent("Google");
  });

  it("shows household preference controls", () => {
    const { container } = render(<AccountPage />);
    expect(container).toHaveTextContent("Household preferences");
    expect(container).toHaveTextContent("Save preferences");
  });

  it("does not promote Facebook linking", () => {
    const { container } = render(<AccountPage />);
    expect(container).not.toHaveTextContent("Link Facebook Account");
  });

  it("still identifies an existing Facebook-linked account", () => {
    mockAuthState.user = {
      uid: "u1",
      displayName: "Test User",
      email: "test@example.com",
      providerData: [
        { providerId: "google.com" },
        { providerId: "facebook.com" },
      ],
    };
    const { container } = render(<AccountPage />);
    expect(container).toHaveTextContent("Google");
    expect(container).toHaveTextContent("Facebook (existing account)");
    const linkBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.includes("Link Facebook")
    );
    expect(linkBtn).toBeUndefined();
  });

  it("offers explicit Friday personalization opt-in", () => {
    const { container } = render(<AccountPage />);
    expect(container).toHaveTextContent("Personalize my Friday email");
  });
});
