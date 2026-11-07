import type { KeyObject } from "node:crypto";
import { sha256Hex } from "./hash";
import { signHash, verifyHash } from "./sign";

/**
 * The ledger: an append-only chain. Each record carries the hash of the one
 * before it, so editing or deleting any record breaks every link after it.
 * Pure logic, no database. Phase 3 wraps buildRecord in a Firestore transaction.
 */
export const RECORD_TYPES = [
  "STARTLIST_SEALED", "OBJECTION", "CHECKIN_SUMMARY", "RESULT_LOCKED", "RESULT_CONTESTED",
  "SELECTION_RULES", "FINAL_LIST", "REMOVAL", "REMOVAL_RESPONSE", "KEY_ROTATION",
] as const;
export type RecordType = (typeof RECORD_TYPES)[number];

export const GENESIS_HASH = "0".repeat(64);

export interface LedgerRecord {
  seq: number;
  type: RecordType;
  payload: Record<string, unknown>;
  prevHash: string;
  createdAt: string;
  keyId: string;
  hash: string;
  sysSig: string;
}
export interface ChainHead { seq: number; hash: string }

function hashedPart(r: Omit<LedgerRecord, "hash" | "sysSig">) {
  return { seq: r.seq, type: r.type, payload: r.payload, prevHash: r.prevHash, createdAt: r.createdAt, keyId: r.keyId };
}

export function buildRecord(args: {
  head: ChainHead | null; type: RecordType; payload: Record<string, unknown>;
  createdAt: string; keyId: string; privateKey: KeyObject;
}): LedgerRecord {
  const base = {
    seq: args.head ? args.head.seq + 1 : 1,
    type: args.type,
    payload: args.payload,
    prevHash: args.head ? args.head.hash : GENESIS_HASH,
    createdAt: args.createdAt,
    keyId: args.keyId,
  };
  const hash = sha256Hex(hashedPart(base));
  return { ...base, hash, sysSig: signHash(hash, args.privateKey) };
}

export type VerifyProblem = {
  seq: number;
  problem: "hash_mismatch" | "bad_signature" | "broken_link" | "missing_record" | "unknown_key";
};

export function verifyRecord(r: LedgerRecord, keys: Record<string, KeyObject>): VerifyProblem[] {
  const problems: VerifyProblem[] = [];
  if (sha256Hex(hashedPart(r)) !== r.hash) problems.push({ seq: r.seq, problem: "hash_mismatch" });
  const key = keys[r.keyId];
  if (!key) problems.push({ seq: r.seq, problem: "unknown_key" });
  else if (!verifyHash(r.hash, r.sysSig, key)) problems.push({ seq: r.seq, problem: "bad_signature" });
  return problems;
}

export function verifyChain(records: LedgerRecord[], keys: Record<string, KeyObject>) {
  const sorted = [...records].sort((a, b) => a.seq - b.seq);
  const problems: VerifyProblem[] = [];
  let prev: LedgerRecord | null = null;
  for (const r of sorted) {
    problems.push(...verifyRecord(r, keys));
    if (prev) {
      if (r.seq !== prev.seq + 1) problems.push({ seq: prev.seq + 1, problem: "missing_record" });
      else if (r.prevHash !== prev.hash) problems.push({ seq: r.seq, problem: "broken_link" });
    } else if (r.seq === 1 && r.prevHash !== GENESIS_HASH) {
      problems.push({ seq: 1, problem: "broken_link" });
    }
    prev = r;
  }
  return { ok: problems.length === 0, checked: sorted.length, problems };
}
