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
  const db = getAdminDb();
  const eventRef = db.collection("resendWebhookEvents").doc(eventId);

  const freshEvent = await db.runTransaction(async (transaction) => {
    if ((await transaction.get(eventRef)).exists) return false;
    transaction.create(eventRef, {
      type: event.type,
      providerEmailId,
      providerCreatedAt: event.created_at,
      receivedAt: FieldValue.serverTimestamp(),
    });
    return true;
  });
  if (!freshEvent || !incoming) return NextResponse.json({ ok: true });

  const deliveries = await db
    .collection("digestDeliveries")
    .where("providerEmailId", "==", providerEmailId)
    .limit(1)
    .get();
  const delivery = deliveries.docs[0];
  if (delivery) {
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(delivery.ref);
      const current = (snapshot.data()?.status ?? "sent") as DeliveryStatus;
      const status = advanceDeliveryStatus(current, incoming);
      transaction.update(delivery.ref, {
        status,
        providerUpdatedAt: Timestamp.fromDate(new Date(event.created_at)),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
  }
  return NextResponse.json({ ok: true });
}
