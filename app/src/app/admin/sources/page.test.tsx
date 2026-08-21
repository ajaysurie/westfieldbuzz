import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSourceHealth: vi.fn(),
  getPendingEventCandidates: vi.fn(),
  getSourceCandidates: vi.fn(),
  reviewCandidate: vi.fn(),
}));

vi.mock("@/components/AdminGate", () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("@/lib/firestore", () => ({
  getSourceHealth: mocks.getSourceHealth,
  getPendingEventCandidates: mocks.getPendingEventCandidates,
  getSourceCandidates: mocks.getSourceCandidates,
  reviewCandidate: mocks.reviewCandidate,
}));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: { getIdToken: vi.fn() } }) }));

import AdminSourcesPage from "./page";

describe("AdminSourcesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("shows source safety and pending review evidence", async () => {
    mocks.getSourceHealth.mockResolvedValue([{
      id: "library", sourceId: "library", sourceName: "Westfield Library", group: "libraries",
      status: "partial", checkedAt: { toDate: () => new Date("2026-08-20T12:00:00Z") },
      nextExpectedRunAt: { toDate: () => new Date("2020-01-01T12:00:00Z") },
      consecutiveFailures: 2, fetched: 4, created: 1, updated: 2, candidates: 1, safetyHeld: true,
      errors: ["Feed changed"], warnings: ["Low count"],
    }]);
    mocks.getPendingEventCandidates.mockResolvedValue([{
      id: "candidate", sourceId: "library", sourceName: "Westfield Library", title: "Storytime",
      date: { toDate: () => new Date("2026-08-22T12:00:00Z") }, sourceUrl: "https://example.com/storytime",
      reason: "possible-cross-source-duplicate", matchingEventIds: ["event-1"], matchingSourceIds: ["source-1"], reviewStatus: "pending",
    }]);
    mocks.getSourceCandidates.mockResolvedValue([]);

    render(<AdminSourcesPage />);

    expect(screen.getByText("Loading source health…")).toBeInTheDocument();
    expect(await screen.findByText("Westfield Library")).toBeInTheDocument();
    expect(screen.getByText("Safety hold")).toBeInTheDocument();
    expect(screen.getByText("Feed changed")).toBeInTheDocument();
    expect(screen.getByText("possible-cross-source-duplicate")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open original source" })).toHaveAttribute("href", "https://example.com/storytime");
  });

  it("has useful empty and error states", async () => {
    mocks.getSourceHealth.mockResolvedValue([]);
    mocks.getPendingEventCandidates.mockResolvedValue([]);
    mocks.getSourceCandidates.mockResolvedValue([]);
    const view = render(<AdminSourcesPage />);

    expect(await screen.findByText(/No approved source health has been recorded yet/)).toBeInTheDocument();
    expect(screen.getByText("No observations are awaiting review.")).toBeInTheDocument();

    mocks.getSourceHealth.mockRejectedValue(new Error("denied"));
    view.getByRole("button", { name: "Refresh" }).click();

    await waitFor(() => expect(screen.getByText(/Source records could not be loaded/)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});
