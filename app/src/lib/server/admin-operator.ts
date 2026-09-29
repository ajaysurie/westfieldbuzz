import { getAdminAuth, getAdminDb } from "./firebase-admin";

/** The allowlisted admin behind a Firebase ID bearer token, or null. */
export async function adminOperator(request: Request): Promise<{ uid: string; email: string } | null> {
  const token = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") ?? "")?.[1] ?? null;
  if (!token) return null;
  try {
    const identity = await getAdminAuth().verifyIdToken(token, true);
    if (!identity.email_verified || !identity.email) return null;
    const admin = await getAdminDb().collection("config").doc("admin").get();
    const allowlist = admin.data()?.allowlist;
    return Array.isArray(allowlist) && allowlist.includes(identity.email)
      ? { uid: identity.uid, email: identity.email } : null;
  } catch { return null; }
}
