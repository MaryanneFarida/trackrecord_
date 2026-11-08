/**
 * Firestore Security Rules tests. Run with:  npm run test:rules
 * (starts the Firestore emulator, runs these tests, then stops it)
 */
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from "firebase/firestore";

let env: RulesTestEnvironment;

const as = (uid: string, role?: string) =>
  env.authenticatedContext(uid, role ? { role } : {}).firestore();
const anon = () => env.unauthenticatedContext().firestore();

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-trackrecord",
    firestore: { rules: readFileSync("firestore.rules", "utf8").replace(/^\uFEFF/, ""), host: "127.0.0.1", port: 8080 },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "users/farida"), { email: "farida@test.ke", role: "athlete", passkeyCount: 1 });
    await setDoc(doc(db, "users/farida/passkeys/pk1"), { publicKey: "x", counter: 1 });
    await setDoc(doc(db, "users/martin"), { email: "martin@test.ke", role: "coach" });
    await setDoc(doc(db, "athletes/farida"), { fullName: "Farida", status: "verified" });
    await setDoc(doc(db, "athletePrivate/farida"), { idPhoto: "encrypted", selfie: "encrypted" });
    await setDoc(doc(db, "invites/hash1"), { role: "coach", usedBy: null });
    await setDoc(doc(db, "auditLog/a1"), { action: "athlete.verified" });
    await setDoc(doc(db, "events/nakuru"), { name: "Nakuru Qualifier" });
    await setDoc(doc(db, "startLists/nakuru/athletes/farida"), { status: "registered" });
    await setDoc(doc(db, "entries/e1"), { createdBy: "martin", athleteId: "farida", time: 1248 });
    await setDoc(doc(db, "checkIns/c1"), { athleteId: "farida", officialId: "otieno" });
    await setDoc(doc(db, "checkInStatus/nakuru_farida"), { athleteId: "farida", eventId: "nakuru" });
    await setDoc(doc(db, "ledger/1"), { seq: 1, type: "RESULT_LOCKED", hash: "abc" });
    await setDoc(doc(db, "medicalReports/m1"), { athleteId: "farida", data: "encrypted" });
  });
});

describe("Rule 1: no browser can write anything", () => {
  const writers = [
    ["signed out", () => anon()],
    ["athlete", () => as("farida", "athlete")],
    ["coach", () => as("martin", "coach")],
    ["admin", () => as("boss", "admin")],
  ] as const;

  for (const [who, db] of writers) {
    it(`${who}: can't create, edit or delete`, async () => {
      await assertFails(setDoc(doc(db(), "ledger/2"), { seq: 2, type: "RESULT_LOCKED" }));
      await assertFails(updateDoc(doc(db(), "ledger/1"), { hash: "forged" }));
      await assertFails(deleteDoc(doc(db(), "ledger/1")));
      await assertFails(updateDoc(doc(db(), "entries/e1"), { time: 1100 }));
      await assertFails(setDoc(doc(db(), "users/farida"), { role: "admin" }));
      await assertFails(setDoc(doc(db(), "athletes/farida"), { status: "rejected" }));
      await assertFails(setDoc(doc(db(), "auditLog/a2"), { action: "fake" }));
      await assertFails(deleteDoc(doc(db(), "auditLog/a1")));
    });
  }
});

describe("Identity data", () => {
  it("users read only their own profile (admin can read any)", async () => {
    await assertSucceeds(getDoc(doc(as("farida", "athlete"), "users/farida")));
    await assertFails(getDoc(doc(as("martin", "coach"), "users/farida")));
    await assertFails(getDoc(doc(anon(), "users/farida")));
    await assertSucceeds(getDoc(doc(as("boss", "admin"), "users/farida")));
  });

  it("passkeys are never readable from a browser, even by their owner", async () => {
    await assertFails(getDoc(doc(as("farida", "athlete"), "users/farida/passkeys/pk1")));
    await assertFails(getDocs(collection(as("boss", "admin"), "users/farida/passkeys")));
  });

  it("encrypted ID photos and invites are server-only, even for the admin", async () => {
    await assertFails(getDoc(doc(as("farida", "athlete"), "athletePrivate/farida")));
    await assertFails(getDoc(doc(as("boss", "admin"), "athletePrivate/farida")));
    await assertFails(getDoc(doc(as("boss", "admin"), "invites/hash1")));
    await assertFails(getDocs(collection(as("boss", "admin"), "invites")));
  });

  it("athlete records: the athlete and staff only", async () => {
    await assertSucceeds(getDoc(doc(as("farida", "athlete"), "athletes/farida")));
    await assertFails(getDoc(doc(as("martin", "coach"), "athletes/farida")));
    await assertSucceeds(getDocs(collection(as("t1", "tribunal"), "athletes")));
    await assertFails(getDocs(collection(as("farida", "athlete"), "athletes")));
  });

  it("the audit log is for the admin and tribunal", async () => {
    await assertSucceeds(getDocs(collection(as("boss", "admin"), "auditLog")));
    await assertSucceeds(getDocs(collection(as("t1", "tribunal"), "auditLog")));
    await assertFails(getDocs(collection(as("martin", "coach"), "auditLog")));
  });

  it("a fake role in the token doesn't help", async () => {
    await assertFails(getDocs(collection(as("hacker", "superadmin"), "auditLog")));
  });
});

describe("Race data", () => {
  it("start lists: the athlete sees their own entry; coaches and officials see the list", async () => {
    await assertSucceeds(getDoc(doc(as("farida", "athlete"), "startLists/nakuru/athletes/farida")));
    await assertFails(getDoc(doc(as("other", "athlete"), "startLists/nakuru/athletes/farida")));
    await assertSucceeds(getDocs(collection(as("martin", "coach"), "startLists/nakuru/athletes")));
    await assertFails(getDocs(collection(as("farida", "athlete"), "startLists/nakuru/athletes")));
  });

  it("entries: only whoever made them, plus staff", async () => {
    await assertSucceeds(getDoc(doc(as("martin", "coach"), "entries/e1")));
    await assertFails(getDoc(doc(as("other", "coach"), "entries/e1")));
    await assertSucceeds(getDoc(doc(as("t1", "tribunal"), "entries/e1")));
  });

  it("check-ins: officials, staff and the athlete concerned", async () => {
    await assertSucceeds(getDoc(doc(as("otieno", "official"), "checkIns/c1")));
    await assertSucceeds(getDoc(doc(as("farida", "athlete"), "checkIns/c1")));
    await assertFails(getDoc(doc(as("martin", "coach"), "checkIns/c1")));
    await assertSucceeds(getDoc(doc(as("farida", "athlete"), "checkInStatus/nakuru_farida")));
    await assertFails(getDoc(doc(as("martin", "coach"), "checkInStatus/nakuru_farida")));
    await assertFails(setDoc(doc(as("otieno", "official"), "checkInStatus/nakuru_bob"), { athleteId: "bob" })); // only the server checks people in
  });

  it("events are visible to anyone signed in", async () => {
    await assertSucceeds(getDoc(doc(as("farida", "athlete"), "events/nakuru")));
    await assertFails(getDoc(doc(anon(), "events/nakuru")));
  });
});

describe("The public record", () => {
  it("anyone, even signed out, can read the ledger and its daily roots, but never write them", async () => {
    await assertSucceeds(getDoc(doc(anon(), "ledger/1")));
    await assertSucceeds(getDocs(collection(anon(), "ledger")));
    await assertSucceeds(getDoc(doc(anon(), "ledgerDays/2026-11-08")));
    await assertFails(setDoc(doc(as("boss", "admin"), "ledgerDays/2026-11-08"), { root: "forged" }));
    await assertFails(setDoc(doc(as("boss", "admin"), "ledgerHead/head"), { seq: 0 }));
  });

  it("medical reports are never readable from a browser", async () => {
    await assertFails(getDoc(doc(as("farida", "athlete"), "medicalReports/m1")));
    await assertFails(getDoc(doc(as("t1", "tribunal"), "medicalReports/m1")));
  });
});
