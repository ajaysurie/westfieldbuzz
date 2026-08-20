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
const mockLoginWithGoogle = vi.fn();
const mockSendEmailLink = vi.fn();
let mockAuthState = {
  user: null as unknown,
  loading: false,
  loggingIn: false,
  authError: "",
  loginWithGoogle: mockLoginWithGoogle,
  sendEmailLink: mockSendEmailLink,
  emailLinkSent: false,
  logout: vi.fn(),
  photoURL: "",
};

vi.mock("@/lib/auth", () => ({
  useAuth: () => mockAuthState,
  safeReturnTo: (value: string | null | undefined) =>
    value && value.startsWith("/") && !value.startsWith("//") ? value : "/",
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
    loginWithGoogle: mockLoginWithGoogle,
    sendEmailLink: mockSendEmailLink,
    emailLinkSent: false,
    logout: vi.fn(),
    photoURL: "",
  };
});

describe("LoginPage", () => {
  it("renders Google and email-link sign-in without Facebook", () => {
    const { container } = render(<LoginPage />);
    const buttons = container.querySelectorAll("button");
    expect(buttons).toHaveLength(2);
    expect(container).toHaveTextContent("Continue with Google");
    expect(container).toHaveTextContent("Email me a sign-in link");
    expect(container).not.toHaveTextContent("Continue with Facebook");
  });

  it("renders 'or' divider between sign-in methods", () => {
    const { container } = render(<LoginPage />);
    expect(container).toHaveTextContent("or");
  });

  it("renders Google button before the email form", () => {
    const { container } = render(<LoginPage />);
    const buttons = container.querySelectorAll("button");
    expect(buttons[0]).toHaveTextContent("Continue with Google");
    expect(buttons[1]).toHaveTextContent("Email me a sign-in link");
  });

  it("calls loginWithGoogle when Google button is clicked", () => {
    const { container } = render(<LoginPage />);
    const googleButton = container.querySelectorAll("button")[0];
    fireEvent.click(googleButton);
    expect(mockLoginWithGoogle).toHaveBeenCalledTimes(1);
  });

  it("sends an email link with the entered address", () => {
    const { container } = render(<LoginPage />);
    fireEvent.change(container.querySelector("input[type=email]")!, { target: { value: "ajay@example.com" } });
    fireEvent.submit(container.querySelector("form")!);
    expect(mockSendEmailLink).toHaveBeenCalledWith("ajay@example.com", "/");
  });

  it("disables both buttons when loggingIn is true", () => {
    mockAuthState.loggingIn = true;
    const { container } = render(<LoginPage />);
    const buttons = container.querySelectorAll("button");
    expect(buttons[0]).toBeDisabled();
    expect(buttons[1]).toBeDisabled();
  });

  it("shows progress on both sign-in methods when loggingIn", () => {
    mockAuthState.loggingIn = true;
    const { container } = render(<LoginPage />);
    const buttons = container.querySelectorAll("button");
    expect(buttons[0]).toHaveTextContent("Signing in...");
    expect(buttons[1]).toHaveTextContent("Sending link...");
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

  it("redirects to home when user is already logged in without returnTo", () => {
    mockAuthState.user = { uid: "u1", displayName: "Test" };
    render(<LoginPage />);
    expect(mockPush).toHaveBeenCalledWith("/");
  });

  it("explains that sign-in is optional", () => {
    const { container } = render(<LoginPage />);
    const subtitle = container.querySelector("p");
    expect(subtitle?.textContent).toContain("Sign in only if you want to save");
  });

  it("shows helpful message for duplicate-email credential conflict", () => {
    mockAuthState.authError = "An account already exists with that email. Use the same sign-in method you used before, or request an email sign-in link.";
    const { container } = render(<LoginPage />);
    expect(container).toHaveTextContent("request an email sign-in link");
  });
});
