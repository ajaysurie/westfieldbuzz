import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import ServiceCard from "../ServiceCard";
import type { Service } from "@/lib/firestore";
import type { Timestamp } from "firebase/firestore";

// Mock next/link
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

afterEach(cleanup);

const makeService = (overrides: Partial<Service> = {}): Service => ({
  id: "svc-1",
  name: "Bob's Plumbing",
  category: "Plumber",
  phone: "908-555-0001",
  email: "",
  address: "123 Elm St, Westfield NJ",
  website: "",
  recommendations: 5,
  recentRecommenders: [],
  lastRecommended: null,
  createdAt: null as unknown as Timestamp,
  ...overrides,
});

describe("ServiceCard", () => {
  it("renders service name and category", () => {
    const { container } = render(<ServiceCard service={makeService()} />);
    expect(container).toHaveTextContent("Bob's Plumbing");
    expect(container).toHaveTextContent("Plumber");
  });

  it("renders address", () => {
    const { container } = render(<ServiceCard service={makeService()} />);
    expect(container).toHaveTextContent("123 Elm St, Westfield NJ");
  });

  it("renders phone number", () => {
    const { container } = render(<ServiceCard service={makeService()} />);
    expect(container).toHaveTextContent("908-555-0001");
  });

  it("renders recommendation count", () => {
    const { container } = render(<ServiceCard service={makeService({ recommendations: 5 })} />);
    expect(container).toHaveTextContent("5 recommendations");
  });

  it("renders singular recommendation", () => {
    const { container } = render(<ServiceCard service={makeService({ recommendations: 1 })} />);
    expect(container).toHaveTextContent("1 recommendation");
  });

  it("hides recommendation count when zero", () => {
    const { container } = render(<ServiceCard service={makeService({ recommendations: 0 })} />);
    expect(container.textContent).not.toContain("recommendation");
  });

  it("links to service detail page", () => {
    const { container } = render(<ServiceCard service={makeService({ id: "svc-42" })} />);
    const link = container.querySelector("a");
    expect(link).toHaveAttribute("href", "/directory/svc-42");
  });

  it("shows first 3 recommender names and +N more", () => {
    const { container } = render(
      <ServiceCard
        service={makeService({
          recentRecommenders: ["Alice Smith", "Bob Jones", "Carol Lee", "Dave Kim", "Eve Park"],
        })}
      />
    );
    expect(container).toHaveTextContent("Alice");
    expect(container).toHaveTextContent("Bob");
    expect(container).toHaveTextContent("Carol");
    expect(container).toHaveTextContent("+ 2 more");
  });

  it("shows displayName from object recommenders", () => {
    const { container } = render(
      <ServiceCard
        service={makeService({
          recentRecommenders: [
            { uid: "u1", displayName: "Alice Smith", timestamp: {} as Timestamp },
            { uid: "u2", displayName: "Bob Jones", timestamp: {} as Timestamp },
          ],
        })}
      />
    );
    expect(container).toHaveTextContent("Alice");
    expect(container).toHaveTextContent("Bob");
  });

  it("shows 'a neighbor' for object recommenders without displayName", () => {
    const { container } = render(
      <ServiceCard
        service={makeService({
          recentRecommenders: [
            { uid: "u1", timestamp: {} as Timestamp },
          ],
        })}
      />
    );
    expect(container).toHaveTextContent("a neighbor");
  });
});
