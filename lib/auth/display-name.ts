import "server-only";
import { adminAuth, adminDb } from "@/lib/firebase/admin";

/**
 * The name to greet someone by. Athletes: their verified name. Others: the name on
 * their Google account if there is one. Never the email address.
 */
export async function firstName(uid: string, role: string | null): Promise<string | null> {
  try {
    if (role === "athlete") {
      const a = await adminDb().collection("athletes").doc(uid).get();
      const full = a.get("fullName") as string | undefined;
      if (full) return full.trim().split(/\s+/)[0];
    }
    const u = await adminAuth().getUser(uid);
    return u.displayName ? u.displayName.trim().split(/\s+/)[0] : null;
  } catch {
    return null;
  }
}
