import type { Firestore, Transaction } from "firebase-admin/firestore";
import type { KeyObject } from "node:crypto";
import { buildRecord, verifyChain, type LedgerRecord, type RecordType, type VerifyProblem } from "./chain";
import { merkleRoot } from "./merkle";

/**
 * The ledger in Firestore:
 *   ledger/{seq as 10 digits}  one record each, e.g. ledger/0000000042
 *   ledgerHead/head            { seq, hash } of the latest record
 *   ledgerDays/{YYYY-MM-DD}    { root, count, firstSeq, lastSeq } (daily Merkle root)
 * Takes the database as a parameter so the same code runs on the server and in emulator tests.
 */
export const LEDGER = "ledger";
export const HEAD = "ledgerHead/head";
export const DAYS = "ledgerDays";
export const docId = (seq: number) => String(seq).padStart(10, "0");

export interface Signer {
  keyId: string;
  privateKey: KeyObject;
}

/**
 * Appends one record inside a transaction. If two appends happen at the same
 * moment, Firestore makes one of them retry against the new head, so two
 * records can never claim the same number or the same previous hash.
 */
export async function appendRecord(
  db: Firestore,
  signer: Signer,
  type: RecordType,
  payload: Record<string, unknown>,
  also?: (tx: Transaction, record: LedgerRecord) => Promise<void>,
): Promise<LedgerRecord> {
  const clean = JSON.parse(JSON.stringify(payload)) as Record<string, unknown>; // no undefined, no class instances
  return db.runTransaction(
    async (tx) => {
      const headRef = db.doc(HEAD);
      const head = await tx.get(headRef);
      const record = buildRecord({
        head: head.exists ? { seq: head.get("seq"), hash: head.get("hash") } : null,
        type,
        payload: clean,
        createdAt: new Date().toISOString(),
        keyId: signer.keyId,
        privateKey: signer.privateKey,
      });
      // Optional extra reads/writes that must succeed or fail together with this record
      // (for example "mark the start list sealed"). It may read first, then write.
      if (also) await also(tx, record);
      const recRef = db.collection(LEDGER).doc(docId(record.seq));
      tx.create(recRef, record); // create() fails if the number somehow already exists
      tx.set(headRef, { seq: record.seq, hash: record.hash, updatedAt: record.createdAt });
      return record;
    },
    { maxAttempts: 25 }, // busy moments: retry rather than fail
  );
}

export async function loadRecords(db: Firestore, fromSeq = 1, limit = 5000): Promise<LedgerRecord[]> {
  const snap = await db.collection(LEDGER).orderBy("seq").startAt(fromSeq).limit(limit).get();
  return snap.docs.map((d) => d.data() as LedgerRecord);
}

export interface StoredChainResult {
  ok: boolean;
  checked: number;
  headSeq: number;
  problems: (VerifyProblem | { seq: number; problem: "head_mismatch" | "wrong_doc_id" })[];
}

/** Re-checks the whole stored chain: every hash, signature and link, plus the head and document IDs. */
export async function verifyStoredChain(db: Firestore, keys: Record<string, KeyObject>): Promise<StoredChainResult> {
  const snap = await db.collection(LEDGER).orderBy("seq").get();
  const records = snap.docs.map((d) => d.data() as LedgerRecord);
  const problems: StoredChainResult["problems"] = [];
  snap.docs.forEach((d, i) => {
    if (d.id !== docId(records[i].seq)) problems.push({ seq: records[i].seq, problem: "wrong_doc_id" });
  });
  const chain = verifyChain(records, keys);
  problems.push(...chain.problems);
  if (records.length > 0 && records[0].seq !== 1) problems.push({ seq: 1, problem: "missing_record" });

  const head = await db.doc(HEAD).get();
  const last = records.at(-1);
  const headSeq = head.exists ? (head.get("seq") as number) : 0;
  if ((last && (!head.exists || head.get("hash") !== last.hash || headSeq !== last.seq)) || (!last && head.exists)) {
    problems.push({ seq: last?.seq ?? headSeq, problem: "head_mismatch" }); // e.g. the newest records were deleted
  }
  return { ok: problems.length === 0, checked: records.length, headSeq, problems };
}

/** Computes and stores the Merkle root for one UTC day (YYYY-MM-DD). Returns null if the day has no records. */
export async function sealDay(db: Firestore, day: string) {
  const start = `${day}T00:00:00.000Z`;
  const end = `${day}T23:59:59.999Z`;
  const snap = await db.collection(LEDGER).where("createdAt", ">=", start).where("createdAt", "<=", end).orderBy("createdAt").get();
  const records = snap.docs.map((d) => d.data() as LedgerRecord).sort((a, b) => a.seq - b.seq);
  if (records.length === 0) return null;
  const summary = {
    day,
    root: merkleRoot(records.map((r) => r.hash)),
    count: records.length,
    firstSeq: records[0].seq,
    lastSeq: records.at(-1)!.seq,
    computedAt: new Date().toISOString(),
  };
  await db.collection(DAYS).doc(day).set(summary);
  return summary;
}
