export {
  EVENT_SOURCES,
  SOURCE_GROUPS,
  isSourceGroup,
  mapCategory,
  sourceById,
  sourcesForGroup,
  type SourceGroup,
} from "../src/lib/server/ingestion/source-registry";

export type { EventSourcePolicy as EventSource } from "../src/lib/server/ingestion/types";
