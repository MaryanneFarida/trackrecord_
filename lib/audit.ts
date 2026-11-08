import "server-only";
import { after } from "next/server";
import { adminDb } from "@/lib/firebase/admin";

/**
 * One audit entry per important action, including refused attempts.
 * Written after the response is sent, so it never slows anyone down.
 * The audit log is readable only by the admin and tribunal (see firestore.rules),
 * and no browser can write or delete it.
 */
export function audit(action: string, uid: string, details: Record<string, unknown> = {}) {
  after(async () => {
    await adminDb()
      .collection("auditLog")
      .add({ action, uid, ...JSON.parse(JSON.stringify(details)), at: new Date().toISOString() })
      .catch((err) => console.error("audit not saved", err));
  });
}
