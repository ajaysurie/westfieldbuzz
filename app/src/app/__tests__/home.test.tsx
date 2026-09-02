import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import HomeContent, { type SerializedHomeEvent } from "../HomeContent";

vi.mock("@/components/search/HomeSearch", () => ({ default: () => <div>Search</div> }));
vi.mock("@/components/FridaySignup", () => ({ FridaySignup: () => <div>Signup</div> }));

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

  it("uses straightforward newsletter copy", () => {
    render(<HomeContent initialEvents={[event]} />);
    expect(screen.getByText("Plan your weekend.")).toBeInTheDocument();
    expect(screen.queryByText(/calmer Friday ritual/i)).not.toBeInTheDocument();
  });
});
