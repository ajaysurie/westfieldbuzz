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
    const link = container.querySelector('a[href="/directory/svc-42"]');
    expect(link).toBeTruthy();
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
    expect(container).toHaveTextContent("A neighbor");
  });

  it("renders Google Maps link when googleMapsUrl is present", () => {
    const { container } = render(
      <ServiceCard
        service={makeService({
          googleMapsUrl: "https://maps.google.com/?cid=12345",
        })}
      />
    );
    const mapLink = container.querySelector('a[title="Google Maps"]');
    expect(mapLink).toBeTruthy();
    expect(mapLink).toHaveAttribute("href", "https://maps.google.com/?cid=12345");
    expect(mapLink).toHaveAttribute("target", "_blank");
  });

  it("renders Instagram link when present", () => {
    const { container } = render(
      <ServiceCard
        service={makeService({
          instagram: "https://www.instagram.com/bobsplumbing",
        })}
      />
    );
    const igLink = container.querySelector('a[title="Instagram"]');
    expect(igLink).toBeTruthy();
    expect(igLink).toHaveAttribute("href", "https://www.instagram.com/bobsplumbing");
    expect(igLink).toHaveAttribute("target", "_blank");
  });

  it("renders Facebook link when present", () => {
    const { container } = render(
      <ServiceCard
        service={makeService({
          facebook: "https://www.facebook.com/bobsplumbing",
        })}
      />
    );
    const fbLink = container.querySelector('a[title="Facebook"]');
    expect(fbLink).toBeTruthy();
    expect(fbLink).toHaveAttribute("href", "https://www.facebook.com/bobsplumbing");
  });

  it("renders Yelp link when present", () => {
    const { container } = render(
      <ServiceCard
        service={makeService({
          yelp: "https://www.yelp.com/biz/bobs-plumbing",
        })}
      />
    );
    const yelpLink = container.querySelector('a[title="Yelp"]');
    expect(yelpLink).toBeTruthy();
    expect(yelpLink).toHaveAttribute("href", "https://www.yelp.com/biz/bobs-plumbing");
  });

  it("does not render social links section when none present", () => {
    const { container } = render(<ServiceCard service={makeService()} />);
    expect(container.querySelector('a[title="Google Maps"]')).toBeNull();
    expect(container.querySelector('a[title="Instagram"]')).toBeNull();
    expect(container.querySelector('a[title="Facebook"]')).toBeNull();
    expect(container.querySelector('a[title="Yelp"]')).toBeNull();
  });
});
