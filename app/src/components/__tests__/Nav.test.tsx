import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import Nav from "../Nav";

const pathname = vi.hoisted(() => ({ value: "/" }));

vi.mock("next/navigation", () => ({ usePathname: () => pathname.value }));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: null, photoURL: null, logout: vi.fn() }),
}));
vi.mock("@/lib/admin", () => ({ isUserAdmin: vi.fn(async () => false) }));

afterEach(cleanup);

describe("Nav", () => {
  it("sends Get the list to the standalone signup page", () => {
    pathname.value = "/";
    render(<Nav />);
    const link = screen.getByRole("link", { name: "Get the list" });
    expect(link).toHaveAttribute("href", "/subscribe");
    expect(link).not.toHaveAttribute("aria-current");
  });

  it("marks Get the list as current on the signup page and its confirmation steps", () => {
    for (const path of ["/subscribe", "/subscribe/confirmed"]) {
      pathname.value = path;
      render(<Nav />);
      expect(screen.getByRole("link", { name: "Get the list" })).toHaveAttribute("aria-current", "page");
      cleanup();
    }
  });
});
