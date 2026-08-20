import type {
  DeliveryClaim,
  DigestRepository,
  DigestSubscriber,
} from "../../delivery";
import type {
  DigestEdition,
  DigestEventSnapshot,
  DigestPreferences,
  DigestSelection,
} from "../../digest";

export const FRIDAY = new Date("2026-08-21T12:00:00.000Z");

export function eventFixture(
  overrides: Partial<DigestEventSnapshot> & Pick<DigestEventSnapshot, "id">
): DigestEventSnapshot {
  const { id, ...rest } = overrides;
  return {
    id,
    title: `Event ${id}`,
    date: "2026-08-22T14:00:00.000Z",
    endDate: null,
    location: "Downtown Westfield",
    town: "Westfield",
    category: "Community",
    status: "scheduled",
    availability: "available",
    sourceUrl: `https://events.example/${id}`,
    publicationStatus: "published",
    freshnessStatus: "current",
    lastVerifiedAt: "2026-08-21T10:00:00.000Z",
    minAge: null,
    maxAge: null,
    costAmount: null,
    isFree: null,
    environment: null,
    driveMinutes: null,
    ...rest,
  };
}

export function preferencesFixture(overrides: Partial<DigestPreferences> = {}): DigestPreferences {
  return {
    towns: ["Westfield"],
    driveMinutes: 20,
    childAges: [],
    interests: [],
    indoorPreference: "either",
    budgetMax: null,
    personalizeFriday: true,
    ...overrides,
  };
}

export function subscriberFixture(overrides: Partial<DigestSubscriber> = {}): DigestSubscriber {
  return {
    id: "a".repeat(64),
    email: "reader@example.com",
    tokenVersion: 1,
    userId: "user-1",
    personalize: true,
    ...overrides,
  };
}

interface MemoryDelivery {
  id: string;
  key: string;
  status: "sending" | "sent" | "failed";
  attempt: number;
  eventIds: string[];
  personalized: boolean;
  providerEmailId?: string;
  subscriberEmail: string;
  tokenVersion: number;
  unsubscribeExpiresAt: Date;
}

export class MemoryDigestRepository implements DigestRepository {
  edition: DigestEdition | null = null;
  inventory: DigestEventSnapshot[] = [];
  subscribers: DigestSubscriber[] = [];
  preferences = new Map<string, DigestPreferences>();
  deliveries = new Map<string, MemoryDelivery>();
  editionCreates = 0;
  inventoryReads = 0;
  subscriberReads = 0;

  async getEdition(id: string): Promise<DigestEdition | null> {
    return this.edition?.id === id ? this.edition : null;
  }

  async listInventory(): Promise<DigestEventSnapshot[]> {
    this.inventoryReads += 1;
    return this.inventory;
  }

  async createEditionIfAbsent(edition: DigestEdition): Promise<DigestEdition> {
    if (!this.edition || (this.edition.status === "held" && edition.status === "ready")) {
      this.edition = edition;
      this.editionCreates += 1;
    }
    return this.edition;
  }

  async listActiveSubscribers(): Promise<DigestSubscriber[]> {
    this.subscriberReads += 1;
    return this.subscribers;
  }

  async getPreferences(userId: string): Promise<DigestPreferences | null> {
    return this.preferences.get(userId) ?? null;
  }

  async claimDelivery(input: {
    editionId: string;
    subscriberId: string;
    selection: DigestSelection;
    now: Date;
  }): Promise<DeliveryClaim | null> {
    const id = `${input.editionId}_${input.subscriberId}`;
    const key = `friday-digest/${input.editionId}/${input.subscriberId}`;
    const existing = this.deliveries.get(id);
    const subscriber = this.subscribers.find((item) => item.id === input.subscriberId);
    if (!subscriber) return null;
    if (existing && existing.status !== "failed") return null;
    const delivery: MemoryDelivery = existing
      ? { ...existing, status: "sending", attempt: existing.attempt + 1 }
      : {
          id,
          key,
          status: "sending",
          attempt: 1,
          eventIds: input.selection.eventIds,
          personalized: input.selection.personalized,
          subscriberEmail: subscriber.email,
          tokenVersion: subscriber.tokenVersion,
          unsubscribeExpiresAt: new Date(input.now.getTime() + 395 * 24 * 60 * 60 * 1000),
        };
    this.deliveries.set(id, delivery);
    return {
      deliveryId: id,
      deliveryKey: key,
      attempt: delivery.attempt,
      eventIds: delivery.eventIds,
      personalized: delivery.personalized,
      subscriberEmail: delivery.subscriberEmail,
      tokenVersion: delivery.tokenVersion,
      unsubscribeExpiresAt: delivery.unsubscribeExpiresAt,
    };
  }

  async markDeliverySent(input: {
    deliveryId: string;
    attempt: number;
    providerEmailId: string;
  }): Promise<void> {
    const delivery = this.deliveries.get(input.deliveryId);
    if (delivery?.attempt === input.attempt) {
      this.deliveries.set(input.deliveryId, {
        ...delivery,
        status: "sent",
        providerEmailId: input.providerEmailId,
      });
    }
  }

  async markDeliveryFailed(input: {
    deliveryId: string;
    attempt: number;
  }): Promise<void> {
    const delivery = this.deliveries.get(input.deliveryId);
    if (delivery?.attempt === input.attempt) {
      this.deliveries.set(input.deliveryId, { ...delivery, status: "failed" });
    }
  }

  deliveryFor(editionId: string, subscriberId: string): MemoryDelivery | undefined {
    return this.deliveries.get(`${editionId}_${subscriberId}`);
  }
}
