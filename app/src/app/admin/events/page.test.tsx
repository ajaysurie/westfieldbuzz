import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getEvents: vi.fn(),
  createEvent: vi.fn(),
  suppressEvent: vi.fn(),
  restoreEvent: vi.fn(),
  getPendingEventCandidates: vi.fn(),
  reviewCandidate: vi.fn(),
  getIdToken: vi.fn(),
}));

vi.mock("@/components/AdminGate", () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("@/lib/firestore", () => ({
  getEvents: mocks.getEvents,
  createEvent: mocks.createEvent,
  suppressEvent: mocks.suppressEvent,
  restoreEvent: mocks.restoreEvent,
  getPendingEventCandidates: mocks.getPendingEventCandidates,
  reviewCandidate: mocks.reviewCandidate,
}));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: { getIdToken: mocks.getIdToken } }) }));
vi.mock("next/link", () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));

import AdminEventsPage from "./page";

const fuzzyCandidate = {
  id: "cand-1",
  sourceId: "galeria-instagram",
  sourceName: "Galeria Instagram",
  title: "Latin Jazz at Galeria",
  date: { toDate: () => new Date("2026-09-19T23:30:00.000Z") },
  reason: "possible-cross-source-duplicate",
  matchKind: "fuzzy",
  matchScore: 0.87,
  matchingEventIds: ["event-123"],
  matchingSourceIds: ["galeria-web"],
  reviewStatus: "pending",
};

describe("AdminEventsPage review queue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getEvents.mockResolvedValue([]);
    mocks.getPendingEventCandidates.mockResolvedValue([fuzzyCandidate]);
    mocks.getIdToken.mockResolvedValue("test-token");
    vi.stubGlobal("confirm", vi.fn(() => true));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("lists held duplicates with match detail and a link to the existing event", async () => {
    render(<AdminEventsPage />);

    expect(await screen.findByText("Needs review (1)")).toBeInTheDocument();
    expect(screen.getByText("Possible duplicate")).toBeInTheDocument();
    expect(screen.getByText("Fuzzy match 87%")).toBeInTheDocument();
    expect(screen.getByText("Latin Jazz at Galeria")).toBeInTheDocument();
    const link = screen.getByText("View event");
    expect(link.closest("a")).toHaveAttribute("href", "/events/event-123");
  });

  it("publishes a candidate through the event review API", async () => {
    render(<AdminEventsPage />);

    await screen.findByText("Needs review (1)");
    fireEvent.click(screen.getByText("Publish"));

    await waitFor(() => {
      expect(mocks.reviewCandidate).toHaveBeenCalledWith("test-token", {
        kind: "event",
        id: "cand-1",
        action: "approve",
      });
    });
  });

  it("hides the review section when nothing is held", async () => {
    mocks.getPendingEventCandidates.mockResolvedValue([]);
    render(<AdminEventsPage />);

    await waitFor(() => {
      expect(mocks.getPendingEventCandidates).toHaveBeenCalled();
    });
    expect(screen.queryByText(/Needs review/)).not.toBeInTheDocument();
  });
});
