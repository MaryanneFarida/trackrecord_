/**
 * Closing check-in against the emulated Firestore. Run with:  npm run test:rules
 * Proves: the CHECKIN_SUMMARY is written once (never twice), only after check-in closes,
 * and records exactly who checked in, who was refused and who didn't show.
 */
import { generateKeyPairSync } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { HEAD, LEDGER, verifyStoredChain } from "@/lib/ledger/store";
import { deriveTimes } from "@/lib/events/rules";
import { EVENTS_COLLECTION, startListPath } from "@/lib/events/seal";
import { CHECKINS, closeCheckIn } from "@/lib/checkin/summary";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const signer = { keyId: "ktest", privateKey };
const H = 3600 * 1000;

let app: App;
let db: Firestore;

beforeEach(async () => {
  if (!app) {
    app = initializeApp({ projectId: "demo-trackrecord" }, `checkin-test-${Date.now()}`);
    db = getFirestore(app);
  }
  for (const c of [LEDGER, EVENTS_COLLECTION, "startLists", CHECKINS]) await db.recursiveDelete(db.collection(c));
  await db.doc(HEAD).delete();
});

afterAll(async () => {
  if (app) await deleteApp(app);
});

async function setup(id: string, raceStart: number) {
  const iso = new Date(raceStart).toISOString();
  await db.collection(EVENTS_COLLECTION).doc(id).set({ name: id, raceStart: iso, ...deriveTimes(iso), sealedAt: "2026-01-01T00:00:00.000Z" });
  for (const a of ["farida", "zawadi", "joy"]) await db.collection(startListPath(id)).doc(a).set({ athleteId: a });
  await db.collection(CHECKINS).add({ eventId: id, athleteId: "farida", outcome: "checked_in", signedHash: "1".repeat(64) });
  await db.collection(CHECKINS).add({ eventId: id, athleteId: "zawadi", outcome: "refused_face", signedHash: "2".repeat(64) });
}

describe("closing check-in", () => {
  it("does nothing while check-in is still open", async () => {
    await setup("nakuru10", Date.now() - 2 * H);
    expect((await closeCheckIn(db, signer, "nakuru10")).closed).toBe(false);
  });

  it("writes one summary, even with 8 pages loading at once", async () => {
    await setup("nakuru11", Date.now() - 9 * H);
    const results = await Promise.all(Array.from({ length: 8 }, () => closeCheckIn(db, signer, "nakuru11")));
    expect(results.filter((r) => r.closed)).toHaveLength(1);
    const recs = await db.collection(LEDGER).where("type", "==", "CHECKIN_SUMMARY").get();
    expect(recs.size).toBe(1);
    expect(recs.docs[0].data().payload).toMatchObject({ checkedIn: ["farida"], refusedFace: ["zawadi"], noShow: ["joy"], attempts: 2 });
    expect((await verifyStoredChain(db, { ktest: publicKey })).ok).toBe(true);
  });
});
