import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";

const mockPush = vi.fn();

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

// Mock next/link
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

// Mock auth context
const mockLoginWithFacebook = vi.fn();
const mockLoginWithGoogle = vi.fn();
let mockAuthState = {
  user: null as unknown,
  loading: false,
  loggingIn: false,
  authError: "",
  loginWithFacebook: mockLoginWithFacebook,
  loginWithGoogle: mockLoginWithGoogle,
  logout: vi.fn(),
  photoURL: "",
};

vi.mock("@/lib/auth", () => ({
  useAuth: () => mockAuthState,
}));

import LoginPage from "../login/page";

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  mockAuthState = {
    user: null,
    loading: false,
    loggingIn: false,
    authError: "",
    loginWithFacebook: mockLoginWithFacebook,
    loginWithGoogle: mockLoginWithGoogle,
    logout: vi.fn(),
    photoURL: "",
  };
});

describe("LoginPage", () => {
  it("renders both Google and Facebook sign-in buttons", () => {
    const { container } = render(<LoginPage />);
    const buttons = container.querySelectorAll("button");
    expect(buttons).toHaveLength(2);
    expect(container).toHaveTextContent("Continue with Google");
    expect(container).toHaveTextContent("Continue with Facebook");
  });

  it("renders 'or' divider between buttons", () => {
    const { container } = render(<LoginPage />);
    expect(container).toHaveTextContent("or");
  });

  it("renders Google button before Facebook button", () => {
    const { container } = render(<LoginPage />);
    const buttons = container.querySelectorAll("button");
    expect(buttons[0]).toHaveTextContent("Continue with Google");
    expect(buttons[1]).toHaveTextContent("Continue with Facebook");
  });

  it("calls loginWithGoogle when Google button is clicked", () => {
    const { container } = render(<LoginPage />);
    const googleButton = container.querySelectorAll("button")[0];
    fireEvent.click(googleButton);
    expect(mockLoginWithGoogle).toHaveBeenCalledTimes(1);
  });

  it("calls loginWithFacebook when Facebook button is clicked", () => {
    const { container } = render(<LoginPage />);
    const facebookButton = container.querySelectorAll("button")[1];
    fireEvent.click(facebookButton);
    expect(mockLoginWithFacebook).toHaveBeenCalledTimes(1);
  });

  it("disables both buttons when loggingIn is true", () => {
    mockAuthState.loggingIn = true;
    const { container } = render(<LoginPage />);
    const buttons = container.querySelectorAll("button");
    expect(buttons[0]).toBeDisabled();
    expect(buttons[1]).toBeDisabled();
  });

  it("shows 'Signing in...' on both buttons when loggingIn", () => {
    mockAuthState.loggingIn = true;
    const { container } = render(<LoginPage />);
    const buttons = container.querySelectorAll("button");
    expect(buttons[0]).toHaveTextContent("Signing in...");
    expect(buttons[1]).toHaveTextContent("Signing in...");
  });

  it("displays auth error when present", () => {
    mockAuthState.authError = "Sign-in failed: auth/popup-blocked";
    const { container } = render(<LoginPage />);
    expect(container).toHaveTextContent("Sign-in failed: auth/popup-blocked");
  });

  it("does not display error when authError is empty", () => {
    const { container } = render(<LoginPage />);
    expect(container.querySelector(".text-sienna")).toBeNull();
  });

  it("shows loading state when auth is loading", () => {
    mockAuthState.loading = true;
    const { container } = render(<LoginPage />);
    expect(container).toHaveTextContent("Loading...");
    expect(container.querySelectorAll("button")).toHaveLength(0);
  });

  it("redirects to /directory when user is already logged in", () => {
    mockAuthState.user = { uid: "u1", displayName: "Test" };
    render(<LoginPage />);
    expect(mockPush).toHaveBeenCalledWith("/directory");
  });

  it("renders provider-neutral copy (no Facebook-specific language)", () => {
    const { container } = render(<LoginPage />);
    const subtitle = container.querySelector("p");
    expect(subtitle?.textContent).toContain("Sign in to recommend");
    expect(subtitle?.textContent).not.toContain("Facebook");
  });

  it("shows helpful message for duplicate-email credential conflict", () => {
    mockAuthState.authError = "An account already exists with that email. Try signing in with Google instead, then link Facebook from your account page.";
    const { container } = render(<LoginPage />);
    expect(container).toHaveTextContent("Try signing in with Google");
    expect(container).toHaveTextContent("link Facebook from your account page");
  });
});
