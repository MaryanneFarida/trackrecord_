import "server-only";
import { after } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { audit } from "@/lib/audit";
import { docId, LEDGER } from "./store";

/**
 * Tamper cases: when a check finds a changed record, TrackRecord opens a case,
 * escalates it to the tribunal, and puts a notice on the dashboard of everyone
 * linked to that record (the athlete, the person who confirmed it, the admin
 * and the tribunal). No email: the notice is inside TrackRecord.
 * Written after the response, so a page never waits for it.
 */

export const CASES = "tamperCases";
export const NOTICES = "notices";

const PLAIN: Record<string, string> = {
  hash_mismatch: "its contents were changed after it was locked",
  bad_signature: "it no longer carries TrackRecord's signature",
  broken_link: "it no longer links to the record before it",
  head_mismatch: "records after it were removed or rewritten",
  missing_record: "a record is missing",
};
export const plainProblem = (code: string) => PLAIN[code] ?? "it failed an integrity check";

async function staffUids(): Promise<string[]> {
  const uids: string[] = [];
  let pageToken: string | undefined;
  do {
    const page = await adminAuth().listUsers(1000, pageToken);
    for (const u of page.users) {
      const role = u.customClaims?.role;
      if (role === "admin" || role === "tribunal") uids.push(u.uid);
    }
    pageToken = page.pageToken;
  } while (pageToken);
  return uids;
}

/** A check found record #seq broken: open a case (once) and notify everyone involved. */
export function reportTamper(seq: number, problems: string[], foundBy: string) {
  if (problems.length === 0) return;
  after(async () => {
    try {
      const db = adminDb();
      const rec = await db.collection(LEDGER).doc(docId(seq)).get();
      const p = (rec.get("payload") ?? {}) as Record<string, unknown>;
      const involved = [p.athleteId, p.coachId, p.officialId].filter((x): x is string => typeof x === "string");
      const caseRef = db.collection(CASES).doc(String(seq));
      const now = new Date().toISOString();

      const opened = await db.runTransaction(async (tx) => {
        const snap = await tx.get(caseRef);
        if (snap.exists && snap.get("status") === "open") return false;
        tx.set(caseRef, { seq, status: "open", problems, foundBy, openedAt: now, involved, escalatedTo: "tribunal" });
        return true;
      });
      if (!opened) return;

      const everyone = [...new Set([...involved, ...(await staffUids())])];
      const batch = db.batch();
      for (const uid of everyone) {
        batch.set(db.collection(NOTICES).doc(`${uid}_${seq}`), { uid, seq, kind: "tamper", problems, createdAt: now });
      }
      await batch.commit();
      audit("ledger.tamper_case_opened", "system", { seq, problems, foundBy, notified: everyone.length });
    } catch (err) {
      console.error("[tamper] could not open case", err);
    }
  });
}

/** The record checks out again (restored to exactly what was locked): close the open case. */
export function markRestored(seq: number) {
  after(async () => {
    try {
      const ref = adminDb().collection(CASES).doc(String(seq));
      const snap = await ref.get();
      if (!snap.exists || snap.get("status") !== "open") return;
      await ref.update({ status: "restored", restoredAt: new Date().toISOString() });
      audit("ledger.tamper_case_restored", "system", { seq });
    } catch (err) {
      console.error("[tamper] could not close case", err);
    }
  });
}

/** Open tamper cases this user should see on their dashboard. */
export async function openNoticesFor(uid: string) {
  const db = adminDb();
  const notices = await db.collection(NOTICES).where("uid", "==", uid).limit(50).get();
  if (notices.empty) return [];
  const cases = await Promise.all(notices.docs.map((n) => db.collection(CASES).doc(String(n.get("seq"))).get()));
  return cases
    .filter((c) => c.exists && c.get("status") === "open")
    .map((c) => ({ seq: c.get("seq") as number, problems: c.get("problems") as string[], openedAt: c.get("openedAt") as string }))
    .sort((a, b) => b.seq - a.seq);
}
