import { doc, getDoc } from "firebase/firestore";
import { db } from "./firebase";

export async function isUserAdmin(email: string | null | undefined): Promise<boolean> {
  if (!email) return false;

  try {
    const adminDoc = await getDoc(doc(db, "config", "admin"));
    if (!adminDoc.exists()) return false;

    const allowlist: string[] = adminDoc.data().allowlist || [];
    return allowlist.includes(email);
  } catch {
    return false;
  }
}
