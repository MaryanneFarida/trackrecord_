import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { merkleProof, merkleRoot, verifyMerkleProof } from "./merkle";

const h = (s: string) => createHash("sha256").update(s).digest("hex");
const day = (n: number) => Array.from({ length: n }, (_, i) => h(`record-${i}`));

describe("daily Merkle root", () => {
  it("proves every record is in the day, for many sizes (including odd ones)", () => {
    for (const n of [1, 2, 3, 5, 8, 13, 100]) {
      const hashes = day(n);
      const root = merkleRoot(hashes);
      hashes.forEach((rec, i) => expect(verifyMerkleProof(rec, merkleProof(hashes, i), root)).toBe(true));
    }
  });
  it("changes completely if any record changes", () => {
    const hashes = day(10);
    const edited = [...hashes];
    edited[6] = h("forged");
    expect(merkleRoot(edited)).not.toBe(merkleRoot(hashes));
  });
  it("rejects a record that isn't in the day, or a proof for the wrong position", () => {
    const hashes = day(10);
    const root = merkleRoot(hashes);
    expect(verifyMerkleProof(h("not-there"), merkleProof(hashes, 3), root)).toBe(false);
    expect(verifyMerkleProof(hashes[4], merkleProof(hashes, 3), root)).toBe(false);
  });
  it("keeps proofs short: 1,000 records need only about 10 hashes", () => {
    expect(merkleProof(day(1000), 500).length).toBeLessThanOrEqual(10);
  });
  it("the order of records matters (a reordered day has a different root)", () => {
    const hashes = day(4);
    expect(merkleRoot([hashes[1], hashes[0], hashes[2], hashes[3]])).not.toBe(merkleRoot(hashes));
  });
});
