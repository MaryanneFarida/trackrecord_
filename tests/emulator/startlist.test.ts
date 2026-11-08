/**
 * Start-list sealing against a real (emulated) Firestore. Run with:  npm run test:rules
 * Proves: a list seals once (never twice, even when many pages load at once),
 * never before its lock time, and any later change to the list is detectable.
 */
import { generateKeyPairSync } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { HEAD, LEDGER, verifyStoredChain } from "@/lib/ledger/store";
import { deriveTimes } from "@/lib/events/rules";
import { EVENTS_COLLECTION, currentListHash, sealStartList, startListPath } from "@/lib/events/seal";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const signer = { keyId: "ktest", privateKey };
const keys = { ktest: publicKey };
const H = 3600 * 1000;

let app: App;
let db: Firestore;

beforeEach(async () => {
  if (!app) {
    app = initializeApp({ projectId: "demo-trackrecord" }, `startlist-test-${Date.now()}`);
    db = getFirestore(app);
  }
  await db.recursiveDelete(db.collection(LEDGER));
  await db.recursiveDelete(db.collection(EVENTS_COLLECTION));
  await db.recursiveDelete(db.collection("startLists"));
  await db.doc(HEAD).delete();
});

afterAll(async () => {
  if (app) await deleteApp(app);
});

async function makeEvent(id: string, raceStart: number, athletes: number) {
  const iso = new Date(raceStart).toISOString();
  await db.collection(EVENTS_COLLECTION).doc(id).set({ name: id, raceStart: iso, ...deriveTimes(iso), events: ["400m"], classes: ["T12"], sealedAt: null });
  for (let i = 0; i < athletes; i++) {
    await db.collection(startListPath(id)).doc(`ath${i}`).set({
      athleteId: `ath${i}`,
      fullName: `Athlete ${i}`,
      sportClass: "T12",
      events: ["400m"],
      signedHash: String(i).repeat(64).slice(0, 64),
    });
  }
}

describe("start list sealing", () => {
  it("does nothing before the lock time", async () => {
    await makeEvent("nakuru01", Date.now() + 48 * H, 3);
    expect((await sealStartList(db, signer, "nakuru01")).sealed).toBe(false);
    expect((await db.collection(LEDGER).get()).size).toBe(0);
  });

  it("seals once after the lock, with a fingerprint of the list in a signed ledger record", async () => {
    await makeEvent("nakuru02", Date.now() + 20 * H, 4); // lock was 4 hours ago
    const r = await sealStartList(db, signer, "nakuru02");
    expect(r).toMatchObject({ sealed: true, sealedSeq: 1 });
    const record = (await db.collection(LEDGER).get()).docs[0].data();
    expect(record.type).toBe("STARTLIST_SEALED");
    expect(record.payload).toMatchObject({ eventId: "nakuru02", count: 4, listHash: r.listHash });
    expect((await db.collection(EVENTS_COLLECTION).doc("nakuru02").get()).get("sealedSeq")).toBe(1);
    expect((await verifyStoredChain(db, keys)).ok).toBe(true);
  });

  it("10 pages loading at the same moment still seal exactly once", async () => {
    await makeEvent("nakuru03", Date.now() + 20 * H, 5);
    const results = await Promise.all(Array.from({ length: 10 }, () => sealStartList(db, signer, "nakuru03")));
    expect(results.filter((r) => r.sealed)).toHaveLength(1);
    const records = await db.collection(LEDGER).where("type", "==", "STARTLIST_SEALED").get();
    expect(records.size).toBe(1);
    expect(new Set(results.map((r) => r.sealedSeq))).toEqual(new Set([1]));
  });

  it("a coach's relative slipped in after sealing is detectable", async () => {
    await makeEvent("nakuru04", Date.now() + 20 * H, 3);
    const { listHash } = await sealStartList(db, signer, "nakuru04");
    await db.collection(startListPath("nakuru04")).doc("relative").set({ athleteId: "relative", sportClass: "T12", events: ["400m"], signedHash: "f".repeat(64) });
    expect(await currentListHash(db, "nakuru04")).not.toBe(listHash);
  });

  it("an athlete silently deleted after sealing is detectable", async () => {
    await makeEvent("nakuru05", Date.now() + 20 * H, 3);
    const { listHash } = await sealStartList(db, signer, "nakuru05");
    await db.collection(startListPath("nakuru05")).doc("ath1").delete();
    expect(await currentListHash(db, "nakuru05")).not.toBe(listHash);
  });
});
