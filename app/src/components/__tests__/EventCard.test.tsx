import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import EventCard from "../EventCard";
import type { Event } from "@/lib/firestore";
import type { Timestamp } from "firebase/firestore";

afterEach(cleanup);

const makeTimestamp = (dateStr: string): Timestamp =>
  ({
    toDate: () => new Date(dateStr),
  } as unknown as Timestamp);

const makeEvent = (overrides: Partial<Event> = {}): Event => ({
  id: "evt-1",
  title: "Downtown Jazz Night",
  description: "Live jazz in the town center",
  date: makeTimestamp("2025-07-15T19:00:00"),
  endDate: makeTimestamp("2025-07-15T22:00:00"),
  location: "Town Center, Westfield",
  category: "Arts & Culture",
  interestedCount: 12,
  createdBy: "admin",
  createdAt: makeTimestamp("2025-06-01T10:00:00"),
  ...overrides,
});

describe("EventCard", () => {
  it("renders title and location", () => {
    const { container } = render(<EventCard event={makeEvent()} />);
    expect(container).toHaveTextContent("Downtown Jazz Night");
    expect(container).toHaveTextContent("Town Center, Westfield");
  });

  it("renders category badge in light mode", () => {
    const { container } = render(<EventCard event={makeEvent()} />);
    const badge = container.querySelector("span.rounded-full");
    expect(badge).toHaveTextContent("Arts & Culture");
  });

  it("renders interested count when > 0", () => {
    const { container } = render(<EventCard event={makeEvent({ interestedCount: 12 })} />);
    expect(container).toHaveTextContent("12 interested");
  });

  it("hides interested count when 0", () => {
    const { container } = render(<EventCard event={makeEvent({ interestedCount: 0 })} />);
    expect(container.textContent).not.toContain("interested");
  });

  it("renders description in light mode", () => {
    const { container } = render(<EventCard event={makeEvent()} />);
    expect(container.querySelector("p")).toHaveTextContent("Live jazz in the town center");
  });

  it("renders dark variant without category badge", () => {
    const { container } = render(<EventCard event={makeEvent()} dark />);
    expect(container).toHaveTextContent("Downtown Jazz Night");
    const badge = container.querySelector("span.rounded-full");
    expect(badge).toBeNull();
  });

  it("handles null endDate", () => {
    const { container } = render(<EventCard event={makeEvent({ endDate: null })} />);
    expect(container).toHaveTextContent("Downtown Jazz Night");
  });
});
