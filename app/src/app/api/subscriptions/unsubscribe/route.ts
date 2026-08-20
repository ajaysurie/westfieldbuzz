import { NextResponse } from "next/server";
import { unsubscribe } from "@/lib/server/email/subscribers";
import { verifyEmailToken } from "@/lib/server/email/tokens";
import { getAdminDb } from "@/lib/server/firebase-admin";

async function tokenFromRequest(request: Request): Promise<string> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = await request.json();
    return typeof body?.token === "string" ? body.token : "";
  }
  const form = await request.formData();
  const token = form.get("token");
  if (typeof token === "string") return token;
  return new URL(request.url).searchParams.get("token") ?? "";
}

export async function POST(request: Request) {
  try {
    const token = verifyEmailToken(
      await tokenFromRequest(request),
      process.env.EMAIL_TOKEN_SECRET ?? ""
    );
    if (!token || token.purpose !== "unsubscribe") {
      return NextResponse.json({ ok: false, status: "invalid" }, { status: 400 });
    }
    const status = await unsubscribe({
      db: getAdminDb(),
      subscriberId: token.subscriberId,
      tokenVersion: token.version,
    });
    return NextResponse.json({ ok: status !== "invalid", status }, { status: status === "invalid" ? 400 : 200 });
  } catch {
    return NextResponse.json({ ok: false, status: "invalid" }, { status: 400 });
  }
}
