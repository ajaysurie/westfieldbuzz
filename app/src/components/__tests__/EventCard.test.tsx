import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { Timestamp } from "firebase/firestore";
import type { Event } from "@/lib/firestore";
import EventCard from "../EventCard";

afterEach(cleanup);

const timestamp = (date: string) => ({ toDate: () => new Date(date) } as Timestamp);

const event = (overrides: Partial<Event> = {}): Event => ({
  id: "evt-1",
  title: "Downtown Jazz Night",
  description: "Live jazz in the town center",
  date: timestamp("2026-08-21T23:00:00Z"),
  endDate: timestamp("2026-08-22T01:00:00Z"),
  location: "Town Center",
  town: "Westfield",
  category: "Arts & Culture",
  interestedCount: 0,
  createdBy: "admin",
  createdAt: timestamp("2026-08-01T10:00:00Z"),
  publicationStatus: "published",
  status: "scheduled",
  availability: "available",
  freshnessStatus: "current",
  lastVerifiedAt: timestamp("2026-08-19T14:00:00Z"),
  sourceUrl: "https://example.com/event",
  ...overrides,
});

describe("EventCard", () => {
  it("links the title and image to the canonical event route", () => {
    render(<EventCard event={event()} />);
    const links = screen.getAllByRole("link", { name: /Downtown Jazz Night|View Downtown Jazz Night/ });
    expect(links).toHaveLength(2);
    expect(links.every((link) => link.getAttribute("href") === "/events/evt-1")).toBe(true);
  });

  it("renders source-backed date, venue, category, and verification", () => {
    render(<EventCard event={event()} />);
    expect(screen.getByText("Arts & Culture")).toBeInTheDocument();
    expect(screen.getByText(/Friday, August 21/)).toBeInTheDocument();
    expect(screen.getByText(/Town Center/)).toBeInTheDocument();
    expect(screen.getByText("Verified Aug 19")).toBeInTheDocument();
    expect(screen.getByText("Live jazz in the town center")).toBeInTheDocument();
  });

  it("shows cancelled status before the detail action", () => {
    render(<EventCard event={event({ status: "cancelled" })} />);
    expect(screen.getByText("Cancelled")).toBeInTheDocument();
  });

  it("handles an event without an end time", () => {
    render(<EventCard event={event({ endDate: null })} />);
    expect(screen.getByText(/7:00 PM/)).toBeInTheDocument();
  });
});
