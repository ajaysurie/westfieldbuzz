import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockPush, saveEvent, unsaveEvent, isEventSaved, clearAuthContinuation, readAuthContinuation } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  saveEvent: vi.fn().mockResolvedValue(undefined),
  unsaveEvent: vi.fn().mockResolvedValue(undefined),
  isEventSaved: vi.fn().mockResolvedValue(false),
  clearAuthContinuation: vi.fn(),
  readAuthContinuation: vi.fn(),
}));
let authState: { user: { uid: string } | null; loading: boolean };

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush }) }));
vi.mock("@/components/CalendarExport", () => ({ default: () => <span>Calendar</span> }));
vi.mock("@/lib/auth", () => ({ useAuth: () => authState }));
vi.mock("@/lib/auth-continuation", () => ({
  createAuthContinuation: () => "d8ab02f1-9e7e-4dc5-9c01-849b5d08dc23",
  continuationLoginHref: () => "/login?continuation=opaque",
  clearAuthContinuation,
  readAuthContinuation,
  stripAuthContinuationParams: (value: string) => {
    const url = new URL(value, "http://localhost");
    url.searchParams.delete("continuation");
    url.searchParams.delete("mode");
    return `${url.pathname}${url.search}${url.hash}`;
  },
}));
vi.mock("@/lib/personalization", () => ({ isEventSaved, saveEvent, unsaveEvent }));

import EventDetailActions from "../EventDetailActions";

const event = { id: "event-1", title: "Concert" } as never;

beforeEach(() => {
  vi.clearAllMocks();
  authState = { user: { uid: "user-1" }, loading: false };
  isEventSaved.mockResolvedValue(false);
  saveEvent.mockResolvedValue(undefined);
  readAuthContinuation.mockReturnValue(null);
  window.history.replaceState({}, "", "/events/event-1");
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("EventDetailActions", () => {
  it("saves and unsaves for the signed-in user without changing an event counter", async () => {
    render(<EventDetailActions event={event} />);
    await waitFor(() => expect(isEventSaved).toHaveBeenCalledWith("user-1", "event-1"));
    fireEvent.click(screen.getByRole("button", { name: "Save event" }));
    await waitFor(() => expect(saveEvent).toHaveBeenCalledWith("user-1", "event-1"));
    expect(screen.getByRole("button", { name: "Saved event" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Saved event" }));
    await waitFor(() => expect(unsaveEvent).toHaveBeenCalledWith("user-1", "event-1"));
  });

  it("sends signed-out save attempts through an opaque continuation", () => {
    authState = { user: null, loading: false };
    render(<EventDetailActions event={event} />);
    fireEvent.click(screen.getByRole("button", { name: "Save event" }));
    expect(mockPush).toHaveBeenCalledWith("/login?continuation=opaque");
  });

  it("clears a cancelled continuation and preserves unrelated target state", async () => {
    authState = { user: null, loading: false };
    const id = "d8ab02f1-9e7e-4dc5-9c01-849b5d08dc23";
    window.history.replaceState({}, "", `/events/event-1?view=calendar&continuation=${id}&mode=cancel#details`);

    render(<EventDetailActions event={event} />);

    await waitFor(() => expect(clearAuthContinuation).toHaveBeenCalledWith(id));
    expect(window.location.href).toBe("http://localhost:3000/events/event-1?view=calendar#details");
    expect(saveEvent).not.toHaveBeenCalled();
  });

  it("retains a failed resumed save and clears it after a successful retry", async () => {
    const id = "d8ab02f1-9e7e-4dc5-9c01-849b5d08dc23";
    readAuthContinuation.mockReturnValue({
      version: 1,
      createdAt: Date.now(),
      returnTo: "/events/event-1?view=calendar",
      action: { kind: "save-event", eventId: "event-1" },
    });
    saveEvent.mockRejectedValueOnce(new Error("offline"));
    window.history.replaceState({}, "", `/events/event-1?view=calendar&continuation=${id}&mode=resume`);

    render(<EventDetailActions event={event} />);
    expect(await screen.findByText("We could not save this event. Try again.")).toBeInTheDocument();
    expect(clearAuthContinuation).not.toHaveBeenCalled();

    saveEvent.mockResolvedValue(undefined);
    fireEvent.click(screen.getByRole("button", { name: "Save event" }));
    await waitFor(() => expect(clearAuthContinuation).toHaveBeenCalledWith(id));
    expect(window.location.href).toBe("http://localhost:3000/events/event-1?view=calendar");
  });
});
