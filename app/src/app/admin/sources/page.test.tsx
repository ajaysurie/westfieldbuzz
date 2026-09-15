import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSourceHealth: vi.fn(),
  getSourceCandidates: vi.fn(),
  reviewCandidate: vi.fn(),
}));

vi.mock("@/components/AdminGate", () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("@/lib/firestore", () => ({
  getSourceHealth: mocks.getSourceHealth,
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

  it("sorts exceptions above healthy sources and hides routine detail", async () => {
    mocks.getSourceHealth.mockResolvedValue([
      {
        id: "library", sourceId: "library", sourceName: "Westfield Library", group: "libraries",
        status: "partial", checkedAt: { toDate: () => new Date("2026-08-20T12:00:00Z") },
        nextExpectedRunAt: { toDate: () => new Date("2020-01-01T12:00:00Z") },
        consecutiveFailures: 2, fetched: 4, created: 1, updated: 2, candidates: 1, safetyHeld: true,
        errors: ["Feed changed"], warnings: ["Low count"],
      },
      {
        id: "schools", sourceId: "schools", sourceName: "Westfield Schools", group: "core-town-school",
        status: "success", checkedAt: { toDate: () => new Date("2026-08-20T12:00:00Z") },
        nextExpectedRunAt: { toDate: () => new Date("2999-01-01T12:00:00Z") },
        consecutiveFailures: 0, fetched: 40, created: 3, updated: 30, candidates: 0,
      },
    ]);
    mocks.getSourceCandidates.mockResolvedValue([]);

    render(<AdminSourcesPage />);

    expect(screen.getByText("Loading source health…")).toBeInTheDocument();
    expect(await screen.findByText("Westfield Library")).toBeInTheDocument();
    expect(screen.getByText("Safety hold")).toBeInTheDocument();
    expect(screen.getByText("Overdue")).toBeInTheDocument();
    expect(screen.getByText("Feed changed")).toBeInTheDocument();
    expect(screen.getByText("Westfield Schools")).toBeInTheDocument();
    expect(screen.getByText("1 of 2")).toBeInTheDocument();
  });

  it("has useful empty and error states", async () => {
    mocks.getSourceHealth.mockResolvedValue([]);
    mocks.getSourceCandidates.mockResolvedValue([]);
    const view = render(<AdminSourcesPage />);

    expect(await screen.findByText("Every recorded source is healthy.")).toBeInTheDocument();
    expect(screen.getByText("No discovered sources are awaiting review.")).toBeInTheDocument();

    mocks.getSourceHealth.mockRejectedValue(new Error("denied"));
    view.getByRole("button", { name: "Refresh" }).click();

    await waitFor(() => expect(screen.getByText(/Source records could not be loaded/)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});
