import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { Resend } from "resend";
import { getAdminDb } from "@/lib/server/firebase-admin";
import {
  deliveryStatusForWebhook,
  isSubscriberSuppressingDeliveryStatus,
  reduceDeliveryTransition,
  type DeliveryStatus,
} from "@/lib/server/email/webhooks";

export async function POST(request: Request) {
  const payload = await request.text();
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
  if (!webhookSecret) return NextResponse.json({ ok: false }, { status: 503 });

  let event;
  try {
    event = new Resend(process.env.RESEND_API_KEY).webhooks.verify({
      payload,
      webhookSecret,
      headers: {
        id: request.headers.get("svix-id") ?? "",
        timestamp: request.headers.get("svix-timestamp") ?? "",
        signature: request.headers.get("svix-signature") ?? "",
      },
    });
  } catch {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const eventId = request.headers.get("svix-id") ?? "";
  if (!eventId || !("email_id" in event.data)) {
    return NextResponse.json({ ok: true });
  }
  const providerEmailId = event.data.email_id;
  const incoming = deliveryStatusForWebhook(event.type);
  if (!incoming) return NextResponse.json({ ok: true });
  const db = getAdminDb();
  const eventRef = db.collection("resendWebhookEvents").doc(eventId);
  const tags = "tags" in event.data && event.data.tags ? event.data.tags : {};
  let deliveryRef =
    typeof tags.delivery_id === "string"
      ? db.collection("digestDeliveries").doc(tags.delivery_id)
      : typeof tags.confirmation_delivery_id === "string"
        ? db.collection("confirmationDeliveries").doc(tags.confirmation_delivery_id)
        : null;

  if (!deliveryRef) {
    const digestDeliveries = await db
      .collection("digestDeliveries")
      .where("providerEmailId", "==", providerEmailId)
      .limit(1)
      .get();
    deliveryRef = digestDeliveries.docs[0]?.ref ?? null;
  }
  if (!deliveryRef) {
    const confirmations = await db
      .collection("confirmationDeliveries")
      .where("providerEmailId", "==", providerEmailId)
      .limit(1)
      .get();
    deliveryRef = confirmations.docs[0]?.ref ?? null;
  }
  if (!deliveryRef) {
    await eventRef.set(
      {
        type: event.type,
        providerEmailId,
        providerCreatedAt: event.created_at,
        processed: true,
        uncorrelated: true,
        receivedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return NextResponse.json({ ok: true });
  }
  const targetRef = deliveryRef;

  await db.runTransaction(async (transaction) => {
    const [eventSnapshot, deliverySnapshot] = await Promise.all([
      transaction.get(eventRef),
      transaction.get(targetRef),
    ]);
    if (eventSnapshot.data()?.processed === true) return;
    if (!deliverySnapshot.exists) {
      transaction.set(eventRef, {
        type: event.type,
        providerEmailId,
        providerCreatedAt: event.created_at,
        processed: true,
        uncorrelated: true,
        processedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      return;
    }

    const deliveryData = deliverySnapshot.data() ?? {};
    const current = (deliveryData.status ?? "sent") as DeliveryStatus;
    const incomingAt = new Date(event.created_at);
    const storedAt =
      deliveryData.providerUpdatedAt instanceof Timestamp
        ? deliveryData.providerUpdatedAt.toDate()
        : new Date(0);
    const transition = reduceDeliveryTransition({
      currentStatus: current,
      currentProviderUpdatedAt: storedAt.getTime() > 0 ? storedAt : null,
      incomingStatus: incoming,
      incomingProviderUpdatedAt: incomingAt,
    });

    if (
      transition.applied
      && typeof deliveryData.subscriberId === "string"
      && isSubscriberSuppressingDeliveryStatus(incoming)
    ) {
      const subscriberRef = db.collection("subscribers").doc(deliveryData.subscriberId);
      const subscriber = await transaction.get(subscriberRef);
      // A provider event belongs to its delivery's consent generation. Do not
      // let a delayed old delivery suppress a newer opt-in for the same email.
      const subscriberVersion = Number(subscriber.data()?.tokenVersion ?? 1);
      const deliveryVersion = Number(deliveryData.tokenVersion ?? 1);
      if (subscriber.exists && subscriberVersion === deliveryVersion) {
        transaction.set(subscriberRef, {
          status: "suppressed",
          suppressedAt: Timestamp.fromDate(incomingAt),
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      }
    }
    if (transition.applied && transition.providerUpdatedAt) {
      transaction.update(targetRef, {
        status: transition.status,
        providerEmailId,
        ...(incoming === "failed" ? { failureOrigin: "provider" } : {}),
        providerUpdatedAt: Timestamp.fromDate(transition.providerUpdatedAt),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    transaction.set(
      eventRef,
      {
        type: event.type,
        providerEmailId,
        providerCreatedAt: event.created_at,
        processed: true,
        processedAt: FieldValue.serverTimestamp(),
        receivedAt: eventSnapshot.exists
          ? eventSnapshot.data()?.receivedAt ?? FieldValue.serverTimestamp()
          : FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });
  return NextResponse.json({ ok: true });
}
