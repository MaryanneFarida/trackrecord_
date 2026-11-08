/**
 * The ledger against a real (emulated) Firestore. Run with:  npm run test:rules
 * Proves Gate A: any edit, deletion or truncation of a stored record is detected,
 * and simultaneous appends never fork the chain.
 */
import { generateKeyPairSync } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { DAYS, HEAD, LEDGER, appendRecord, docId, sealDay, verifyStoredChain } from "@/lib/ledger/store";
import { merkleProof, verifyMerkleProof } from "@/lib/ledger/merkle";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const signer = { keyId: "ktest", privateKey };
const keys = { ktest: publicKey };

let app: App;
let db: Firestore;

beforeEach(async () => {
  if (!app) {
    app = initializeApp({ projectId: "demo-trackrecord" }, `ledger-test-${Date.now()}`);
    db = getFirestore(app);
  }
  await db.recursiveDelete(db.collection(LEDGER));
  await db.recursiveDelete(db.collection(DAYS));
  await db.doc(HEAD).delete();
});

afterAll(async () => {
  if (app) await deleteApp(app);
});

async function appendMany(n: number) {
  for (let i = 0; i < n; i++) {
    await appendRecord(db, signer, "RESULT_LOCKED", { athleteId: `a${i}`, eventId: "nakuru", timeHundredths: 5800 + i });
  }
}

describe("ledger in Firestore", () => {
  it("appends a valid, numbered, chained record", async () => {
    await appendMany(30);
    const result = await verifyStoredChain(db, keys);
    expect(result).toMatchObject({ ok: true, checked: 30, headSeq: 30 });
    expect((await db.collection(LEDGER).doc(docId(30)).get()).exists).toBe(true);
  });

  it("GATE A: an edited time is caught at the exact record", async () => {
    await appendMany(30);
    await db.collection(LEDGER).doc(docId(12)).update({ "payload.timeHundredths": 5000 }); // someone with database access cheats
    const result = await verifyStoredChain(db, keys);
    expect(result.ok).toBe(false);
    expect(result.problems).toContainEqual({ seq: 12, problem: "hash_mismatch" });
  });

  it("a deleted record in the middle is caught", async () => {
    await appendMany(30);
    await db.collection(LEDGER).doc(docId(18)).delete();
    expect((await verifyStoredChain(db, keys)).problems).toContainEqual({ seq: 18, problem: "missing_record" });
  });

  it("quietly deleting the newest records is caught by the head", async () => {
    await appendMany(10);
    await db.collection(LEDGER).doc(docId(10)).delete();
    await db.collection(LEDGER).doc(docId(9)).delete();
    expect((await verifyStoredChain(db, keys)).problems).toContainEqual({ seq: 8, problem: "head_mismatch" });
  });

  it("a record rebuilt by someone without the signing key is caught", async () => {
    await appendMany(5);
    const forger = { keyId: "ktest", privateKey: generateKeyPairSync("ed25519").privateKey };
    await db.collection(LEDGER).doc(docId(5)).delete();
    await db.doc(HEAD).set({ seq: 4, hash: (await db.collection(LEDGER).doc(docId(4)).get()).get("hash") });
    await appendRecord(db, forger, "RESULT_LOCKED", { athleteId: "cheat", eventId: "nakuru", timeHundredths: 4000 });
    expect((await verifyStoredChain(db, keys)).problems).toContainEqual({ seq: 5, problem: "bad_signature" });
  });

  it("15 simultaneous appends never share a number or fork the chain", async () => {
    await Promise.all(
      Array.from({ length: 15 }, (_, i) =>
        appendRecord(db, signer, "RESULT_LOCKED", { athleteId: `p${i}`, eventId: "eldoret", timeHundredths: 6000 + i }),
      ),
    );
    const result = await verifyStoredChain(db, keys);
    expect(result).toMatchObject({ ok: true, checked: 15, headSeq: 15 });
  });

  it("seals a day with a Merkle root that proves each record was included", async () => {
    await appendMany(7);
    const day = new Date().toISOString().slice(0, 10);
    const summary = await sealDay(db, day);
    expect(summary).toMatchObject({ count: 7, firstSeq: 1, lastSeq: 7 });
    const records = (await db.collection(LEDGER).orderBy("seq").get()).docs.map((d) => d.get("hash") as string);
    records.forEach((hash, i) => expect(verifyMerkleProof(hash, merkleProof(records, i), summary!.root)).toBe(true));
    expect((await db.collection(DAYS).doc(day).get()).get("root")).toBe(summary!.root);
  });
});
