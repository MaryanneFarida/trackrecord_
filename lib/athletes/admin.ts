import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import { serverEnv } from "@/lib/env";
import { open } from "@/lib/crypto/files";

export interface PendingAthlete {
  uid: string;
  email: string | null;
  fullName: string;
  licenceNo: string;
  sportClass: string;
  events: string[];
  guideRunner: boolean;
  submittedAt: string;
}

export async function listPendingAthletes(): Promise<PendingAthlete[]> {
  const snap = await adminDb().collection("athletes").where("status", "==", "pending").limit(50).get();
  return snap.docs
    .map((d) => ({ uid: d.id, ...(d.data() as Omit<PendingAthlete, "uid">) }))
    .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
}

/** Decrypts the two photos for the admin's review. Never cached, never sent to anyone else. */
export async function athletePhotos(uid: string): Promise<{ idPhoto: string; selfie: string } | null> {
  const doc = await adminDb().collection("athletePrivate").doc(uid).get();
  if (!doc.exists) return null;
  const key = serverEnv().FILE_ENCRYPTION_KEY;
  const toUrl = (field: "idPhoto" | "selfie") =>
    "data:image/jpeg;base64," + open(doc.get(field), key, `athlete:${uid}:${field}`).toString("base64");
  try {
    return { idPhoto: toUrl("idPhoto"), selfie: toUrl("selfie") };
  } catch {
    return null; // tampered or wrong key: show nothing rather than something altered
  }
}
