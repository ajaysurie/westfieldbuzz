import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FridaySignup } from "../FridaySignup";

vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: null }) }));

afterEach(() => vi.restoreAllMocks());

describe("FridaySignup", () => {
  it("submits an anonymous email and replaces the form with confirmation", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 202 })
    );
    render(<FridaySignup />);
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "ajay@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Get the list" }));
    await waitFor(() => expect(screen.getByText("You're almost on Friday's list.")).toBeInTheDocument());
    expect(fetch).toHaveBeenCalledWith(
      "/api/subscriptions",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("keeps the form usable after a server error", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ message: "Please try again." }), { status: 503 })
    );
    render(<FridaySignup />);
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "ajay@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Get the list" }));
    await waitFor(() => expect(screen.getByText("Please try again.")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Get the list" })).toBeEnabled();
  });
});
