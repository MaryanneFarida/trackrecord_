import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildRecord, verifyChain, type LedgerRecord } from "./chain";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const keys = { k1: publicKey };

function makeChain(n: number): LedgerRecord[] {
  const out: LedgerRecord[] = [];
  for (let i = 0; i < n; i++) {
    const head = out.at(-1) ?? null;
    out.push(buildRecord({
      head: head ? { seq: head.seq, hash: head.hash } : null,
      type: "RESULT_LOCKED",
      payload: { athleteId: `a${i}`, eventId: "nakuru-2026", timeHundredths: 1248 + i },
      createdAt: new Date(Date.UTC(2026, 10, 8, 9, 0, i)).toISOString(),
      keyId: "k1",
      privateKey,
    }));
  }
  return out;
}

describe("ledger chain", () => {
  it("verifies an untouched chain of 100 records", () => {
    const result = verifyChain(makeChain(100), keys);
    expect(result.ok).toBe(true);
    expect(result.checked).toBe(100);
  });

  it("catches an edited time at the exact record (Gate A)", () => {
    const chain = makeChain(10);
    chain[4] = { ...chain[4], payload: { ...chain[4].payload, timeHundredths: 1100 } };
    expect(verifyChain(chain, keys).problems).toContainEqual({ seq: 5, problem: "hash_mismatch" });
  });

  it("catches a rebuilt record signed with the wrong key", () => {
    const chain = makeChain(10);
    chain[4] = buildRecord({
      head: { seq: chain[3].seq, hash: chain[3].hash },
      type: "RESULT_LOCKED",
      payload: { athleteId: "someone-else", eventId: "nakuru-2026", timeHundredths: 1000 },
      createdAt: chain[4].createdAt,
      keyId: "k1",
      privateKey: generateKeyPairSync("ed25519").privateKey,
    });
    const { problems } = verifyChain(chain, keys);
    expect(problems).toContainEqual({ seq: 5, problem: "bad_signature" });
    expect(problems).toContainEqual({ seq: 6, problem: "broken_link" });
  });

  it("catches a deleted record", () => {
    const chain = makeChain(10);
    chain.splice(6, 1);
    expect(verifyChain(chain, keys).problems).toContainEqual({ seq: 7, problem: "missing_record" });
  });
});
