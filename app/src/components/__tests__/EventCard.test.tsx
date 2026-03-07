import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import type { Event } from "@/lib/firestore";
import type { Timestamp } from "firebase/firestore";

// Mock firebase before importing EventCard (which imports InterestedButton → auth → firebase)
vi.mock("@/lib/firebase", () => ({
  auth: {},
  db: {},
  facebookProvider: {},
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: null, loading: false, loggingIn: false, authError: "", loginWithFacebook: vi.fn(), logout: vi.fn() }),
}));

vi.mock("@/lib/firestore", () => ({
  hasUserInterested: vi.fn().mockResolvedValue(false),
  markInterested: vi.fn().mockResolvedValue(undefined),
  unmarkInterested: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("firebase/auth", () => ({
  onAuthStateChanged: vi.fn(),
  signInWithPopup: vi.fn(),
  signInWithRedirect: vi.fn(),
  getRedirectResult: vi.fn().mockResolvedValue(null),
  signOut: vi.fn(),
  getAuth: vi.fn(() => ({})),
  FacebookAuthProvider: vi.fn(),
}));

// Import after mocks
import EventCard from "../EventCard";

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

  it("renders colored top border on light card", () => {
    const { container } = render(<EventCard event={makeEvent({ category: "Sports" })} />);
    const card = container.firstElementChild as HTMLElement;
    expect(card.style.borderTop).toContain("3px solid");
  });

  it("uses accent fallback for unknown category border", () => {
    const { container } = render(<EventCard event={makeEvent({ category: "Unknown" })} />);
    const card = container.firstElementChild as HTMLElement;
    expect(card.style.borderTop).toContain("var(--accent)");
  });
});
