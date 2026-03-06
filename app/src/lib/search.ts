import Fuse from "fuse.js";
import type { Service } from "./firestore";

const fuseOptions = {
  keys: [
    { name: "name", weight: 0.5 },
    { name: "category", weight: 0.3 },
    { name: "address", weight: 0.2 },
  ],
  threshold: 0.35,
  includeScore: true,
};

export function searchServices(services: Service[], query: string): Service[] {
  if (!query.trim()) return services;

  const fuse = new Fuse(services, fuseOptions);
  return fuse.search(query).map((result) => result.item);
}
