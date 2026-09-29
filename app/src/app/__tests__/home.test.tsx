import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import HomeContent, { type SerializedHomeEvent } from "../HomeContent";

vi.mock("@/components/search/HomeSearch", () => ({ default: () => <div>Search</div> }));
vi.mock("@/components/FridaySignup", () => ({ FridaySignup: () => <div>Signup</div> }));
vi.mock("@/components/WeatherBanner", () => ({ default: () => null }));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/lib/personalization", () => ({ useSavedEventIds: () => new Set<string>() }));

afterEach(cleanup);

const event: SerializedHomeEvent = {
  id: "cold-load-event",
  title: "Library story time",
  description: "Stories for children",
  date: new Date(Date.now() + 60_000).toISOString(),
  endDate: null,
  location: "Westfield Memorial Library",
  town: "Westfield",
  category: "Family & Kids",
  interestedCount: 0,
  createdBy: "ingest",
  createdAt: new Date().toISOString(),
  publicationStatus: "published",
  freshnessStatus: "current",
};

describe("homepage agenda", () => {
  it("renders server-provided events on the initial render without a false empty state", () => {
    render(<HomeContent initialEvents={[event]} />);
    expect(screen.getByText("Library story time")).toBeInTheDocument();
    expect(screen.queryByText("No events listed this week")).not.toBeInTheDocument();
  });

  it("filters within the agenda's four days instead of reaching past them", () => {
    const day = (offset: number, overrides: Partial<SerializedHomeEvent>): SerializedHomeEvent => ({
      ...event,
      date: new Date(Date.now() + offset * 86_400_000 + 60_000).toISOString(),
      ...overrides,
    });
    render(<HomeContent initialEvents={[
      day(0, { id: "d0", title: "Day 0 in Westfield" }),
      day(1, { id: "d1", title: "Day 1 in Cranford", town: "Cranford" }),
      day(2, { id: "d2", title: "Day 2 in Westfield" }),
      day(3, { id: "d3", title: "Day 3 in Westfield" }),
      day(5, { id: "d5", title: "Day 5 in Summit", town: "Summit" }),
    ]} />);

    expect(screen.queryByText("Day 5 in Summit")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Summit" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cranford" }));
    expect(screen.getByText("Day 1 in Cranford")).toBeInTheDocument();
    expect(screen.queryByText("Day 0 in Westfield")).not.toBeInTheDocument();
    expect(screen.queryByText("Day 5 in Summit")).not.toBeInTheDocument();
  });

  it("uses straightforward newsletter copy", () => {
    render(<HomeContent initialEvents={[event]} />);
    expect(screen.getByText("Plan your weekend.")).toBeInTheDocument();
    expect(screen.queryByText(/calmer Friday ritual/i)).not.toBeInTheDocument();
  });
});
