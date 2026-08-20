import type { ParsedIntent, SearchIntent } from "./event-intent";
import type { SearchableEvent } from "./event-retrieval";

export interface SearchResultItem {
  event: SearchableEvent;
  rank: number;
  label: string;
  reason: string;
}

export interface EventSearchSuccess {
  ok: true;
  query: string;
  intent: SearchIntent;
  results: SearchResultItem[];
  fallbackUsed: boolean;
  parserWarning?: ParsedIntent["parserWarning"];
  ambiguities: SearchIntent["ambiguities"];
  /** Requested hard facts that inventory cannot currently verify. */
  unresolvedConstraints?: string[];
  suggestions: string[];
  meta: {
    candidateCount: number;
    matchedCount: number;
    durationMs: number;
  };
}

export interface EventSearchFailure {
  ok: false;
  error: {
    code:
      | "invalid_request"
      | "request_too_large"
      | "rate_limited"
      | "inventory_unavailable";
    message: string;
  };
  intent?: SearchIntent;
  fallbackUsed?: boolean;
}

export type EventSearchResponse = EventSearchSuccess | EventSearchFailure;
