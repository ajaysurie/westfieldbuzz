import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockLinkFacebook = vi.fn();
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
    linkFacebook: mockLinkFacebook,
    logout: mockLogout,
  };
});

describe("AccountPage — linked accounts", () => {
  it("shows Google as a linked provider", () => {
    const { container } = render(<AccountPage />);
    expect(container).toHaveTextContent("Google");
  });

  it("shows 'Link Facebook Account' button when Facebook is not linked", () => {
    const { container } = render(<AccountPage />);
    expect(container).toHaveTextContent("Link Facebook Account");
  });

  it("calls linkFacebook when link button is clicked", () => {
    const { container } = render(<AccountPage />);
    const linkBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.includes("Link Facebook")
    );
    expect(linkBtn).toBeTruthy();
    fireEvent.click(linkBtn!);
    expect(mockLinkFacebook).toHaveBeenCalledTimes(1);
  });

  it("does not show link button when Facebook is already linked", () => {
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
    expect(container).toHaveTextContent("Facebook");
    const linkBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.includes("Link Facebook")
    );
    expect(linkBtn).toBeUndefined();
  });

  it("shows auth error when linking fails", () => {
    mockAuthState.authError = "That Facebook account is already linked to a different user.";
    const { container } = render(<AccountPage />);
    expect(container).toHaveTextContent("already linked to a different user");
  });
});
