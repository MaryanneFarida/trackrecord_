import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import type { PasskeyStore, StoredPasskey } from "./store";

/** Passkeys live in users/{uid}/passkeys/{credentialId}. Only the server can read or write them. */
export function firestoreStore(): PasskeyStore {
  const col = (uid: string) => adminDb().collection("users").doc(uid).collection("passkeys");
  return {
    async list(uid) {
      const snap = await col(uid).get();
      return snap.docs.map((d) => {
        const v = d.data();
        return { ...(v as StoredPasskey), publicKey: new Uint8Array(v.publicKey) as Uint8Array<ArrayBuffer> };
      });
    },
    async add(uid, pk) {
      const db = adminDb();
      const batch = db.batch();
      batch.set(col(uid).doc(pk.id), { ...pk, publicKey: Buffer.from(pk.publicKey) });
      batch.set(db.collection("users").doc(uid), { passkeyCount: FieldValue.increment(1) }, { merge: true });
      await batch.commit();
    },
    async touch(uid, id, counter, at) {
      await col(uid).doc(id).update({ counter, lastUsedAt: at });
    },
  };
}

/** Fast check used on every role page: does this user have at least one passkey? */
export async function hasPasskey(uid: string): Promise<boolean> {
  const doc = await adminDb().collection("users").doc(uid).get();
  return (doc.get("passkeyCount") ?? 0) > 0;
}
