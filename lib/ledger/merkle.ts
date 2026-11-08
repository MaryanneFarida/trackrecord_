import { createHash } from "node:crypto";

/**
 * Merkle tree over one day's ledger record hashes.
 * The root is a single fingerprint for the whole day: Phase 8 stamps it
 * publicly. A proof shows one record is part of that day using only a
 * handful of hashes, without revealing the other records.
 *
 * Leaves and inner nodes are hashed with different prefixes (0x00 / 0x01),
 * so an inner node can never be passed off as a record. An odd node at the
 * end of a level is carried up unchanged (never duplicated, which is a known
 * weakness of some older designs).
 */

const sha = (...parts: Buffer[]) => createHash("sha256").update(Buffer.concat(parts)).digest();
const leaf = (recordHashHex: string) => sha(Buffer.from([0x00]), Buffer.from(recordHashHex, "hex"));
const node = (left: Buffer, right: Buffer) => sha(Buffer.from([0x01]), left, right);

export interface ProofStep {
  sibling: string; // hex
  side: "left" | "right"; // where the sibling sits
}

function levels(recordHashes: string[]): Buffer[][] {
  if (recordHashes.length === 0) throw new Error("A Merkle tree needs at least one record");
  const all: Buffer[][] = [recordHashes.map(leaf)];
  while (all.at(-1)!.length > 1) {
    const cur = all.at(-1)!;
    const next: Buffer[] = [];
    for (let i = 0; i < cur.length; i += 2) next.push(i + 1 < cur.length ? node(cur[i], cur[i + 1]) : cur[i]);
    all.push(next);
  }
  return all;
}

export function merkleRoot(recordHashes: string[]): string {
  return levels(recordHashes).at(-1)![0].toString("hex");
}

export function merkleProof(recordHashes: string[], index: number): ProofStep[] {
  if (index < 0 || index >= recordHashes.length) throw new Error("Index out of range");
  const proof: ProofStep[] = [];
  let i = index;
  for (const level of levels(recordHashes).slice(0, -1)) {
    const isRight = i % 2 === 1;
    const siblingIndex = isRight ? i - 1 : i + 1;
    if (siblingIndex < level.length) proof.push({ sibling: level[siblingIndex].toString("hex"), side: isRight ? "left" : "right" });
    i = Math.floor(i / 2);
  }
  return proof;
}

export function verifyMerkleProof(recordHashHex: string, proof: ProofStep[], rootHex: string): boolean {
  let h = leaf(recordHashHex);
  for (const step of proof) {
    const s = Buffer.from(step.sibling, "hex");
    h = step.side === "left" ? node(s, h) : node(h, s);
  }
  return h.toString("hex") === rootHex;
}
