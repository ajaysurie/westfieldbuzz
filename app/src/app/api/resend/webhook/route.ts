import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { Resend } from "resend";
import { getAdminDb } from "@/lib/server/firebase-admin";
import {
  advanceDeliveryStatus,
  deliveryStatusForWebhook,
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

  const deliveries = await db
    .collection("digestDeliveries")
    .where("providerEmailId", "==", providerEmailId)
    .limit(1)
    .get();
  const delivery = deliveries.docs[0];
  if (!delivery) {
    await eventRef.set(
      {
        type: event.type,
        providerEmailId,
        providerCreatedAt: event.created_at,
        processed: false,
        receivedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return NextResponse.json({ ok: false, retry: true }, { status: 503 });
  }

  await db.runTransaction(async (transaction) => {
    const [eventSnapshot, deliverySnapshot] = await Promise.all([
      transaction.get(eventRef),
      transaction.get(delivery.ref),
    ]);
    if (eventSnapshot.data()?.processed === true) return;

    const deliveryData = deliverySnapshot.data() ?? {};
    const current = (deliveryData.status ?? "sent") as DeliveryStatus;
    const status = advanceDeliveryStatus(current, incoming);
    const incomingAt = new Date(event.created_at);
    const storedAt =
      deliveryData.providerUpdatedAt instanceof Timestamp
        ? deliveryData.providerUpdatedAt.toDate()
        : new Date(0);

    transaction.update(delivery.ref, {
      status,
      providerUpdatedAt: Timestamp.fromDate(
        incomingAt.getTime() > storedAt.getTime() ? incomingAt : storedAt
      ),
      updatedAt: FieldValue.serverTimestamp(),
    });
    if (
      typeof deliveryData.subscriberId === "string" &&
      ["bounced", "complained", "suppressed"].includes(incoming)
    ) {
      transaction.set(
        db.collection("subscribers").doc(deliveryData.subscriberId),
        {
          status: "suppressed",
          suppressedAt: Timestamp.fromDate(incomingAt),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
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
