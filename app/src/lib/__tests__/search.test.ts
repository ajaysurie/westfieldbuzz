import { describe, it, expect } from "vitest";
import { searchServices } from "../search";
import type { Service } from "../firestore";
import type { Timestamp } from "firebase/firestore";

const makeService = (overrides: Partial<Service>): Service => ({
  id: "1",
  name: "Test Service",
  category: "Plumber",
  phone: "908-555-0001",
  email: "",
  address: "123 Main St, Westfield NJ",
  website: "",
  recommendations: 3,
  recentRecommenders: [],
  lastRecommended: null,
  createdAt: null as unknown as Timestamp,
  ...overrides,
});

const SERVICES: Service[] = [
  makeService({ id: "1", name: "Bob's Plumbing", category: "Plumber", address: "Elm St" }),
  makeService({ id: "2", name: "Quick Electric Co", category: "Electrician", address: "Broad St" }),
  makeService({ id: "3", name: "Green Thumb Landscaping", category: "Landscaper", address: "Central Ave" }),
  makeService({ id: "4", name: "Sparkle Clean House", category: "House Cleaner", address: "South Ave" }),
  makeService({ id: "5", name: "Fix-It Fred Handyman", category: "Handyman", address: "North Ave" }),
];

describe("searchServices", () => {
  it("returns all services for empty query", () => {
    expect(searchServices(SERVICES, "")).toEqual(SERVICES);
  });

  it("returns all services for whitespace-only query", () => {
    expect(searchServices(SERVICES, "   ")).toEqual(SERVICES);
  });

  it("matches by name", () => {
    const results = searchServices(SERVICES, "Bob's Plumbing");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].name).toBe("Bob's Plumbing");
  });

  it("matches by category", () => {
    const results = searchServices(SERVICES, "Electrician");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].category).toBe("Electrician");
  });

  it("handles fuzzy matching", () => {
    const results = searchServices(SERVICES, "plumbing");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].name).toBe("Bob's Plumbing");
  });

  it("returns empty for gibberish", () => {
    const results = searchServices(SERVICES, "zzxqqww123");
    expect(results).toEqual([]);
  });

  it("returns empty for empty services array", () => {
    const results = searchServices([], "plumber");
    expect(results).toEqual([]);
  });

  it("matches by address", () => {
    const results = searchServices(SERVICES, "Elm St");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].address).toBe("Elm St");
  });
});
