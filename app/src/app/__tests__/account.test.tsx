import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { act, render, cleanup, screen, waitFor } from "@testing-library/react";

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
import { getPreferences, type HouseholdPreferences } from "@/lib/personalization";

const DEFAULT_PREFERENCES: HouseholdPreferences = {
  towns: ["Westfield"],
  driveMinutes: 20,
  childAges: [],
  interests: [],
  indoorPreference: "either",
  budgetMax: null,
  personalizeFriday: false,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getPreferences).mockReset().mockResolvedValue(DEFAULT_PREFERENCES);
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
  getSavedEventIds: vi.fn().mockResolvedValue([]),
  getSavedSearches: vi.fn().mockResolvedValue([]),
  unsaveEvent: vi.fn().mockResolvedValue(undefined),
  unsaveSearch: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/firestore", () => ({ getPublishedEventById: vi.fn().mockResolvedValue(null) }));

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

  it("waits for the current user's preferences and ignores obsolete hydration", async () => {
    const first = deferred<HouseholdPreferences>();
    const second = deferred<HouseholdPreferences>();
    vi.mocked(getPreferences)
      .mockReset()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);

    const { rerender } = render(<AccountPage />);
    expect(screen.getByLabelText("Towns, separated by commas")).toBeDisabled();
    expect(screen.getByLabelText("Children's ages, separated by commas")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Music" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: /Personalize my Friday email/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save preferences" })).toBeDisabled();

    mockAuthState = {
      ...mockAuthState,
      user: {
        uid: "u2",
        displayName: "Second User",
        email: "second@example.com",
        providerData: [{ providerId: "google.com" }],
      },
    };
    rerender(<AccountPage />);
    expect(screen.getByRole("button", { name: "Save preferences" })).toBeDisabled();

    await act(async () => {
      second.resolve({ ...DEFAULT_PREFERENCES, towns: ["Cranford"], childAges: [7] });
    });
    await waitFor(() => expect(screen.getByRole("button", { name: "Save preferences" })).toBeEnabled());
    expect(screen.getByLabelText("Towns, separated by commas")).toHaveValue("Cranford");
    expect(screen.getByLabelText("Children's ages, separated by commas")).toHaveValue("7");

    await act(async () => {
      first.resolve({ ...DEFAULT_PREFERENCES, towns: ["Summit"], childAges: [4] });
    });
    expect(screen.getByLabelText("Towns, separated by commas")).toHaveValue("Cranford");
    expect(screen.getByLabelText("Children's ages, separated by commas")).toHaveValue("7");
    expect(getPreferences).toHaveBeenNthCalledWith(1, "u1");
    expect(getPreferences).toHaveBeenNthCalledWith(2, "u2");
  });
});
