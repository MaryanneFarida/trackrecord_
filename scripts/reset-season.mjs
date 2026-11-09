// Clears all competition data so testing can start from a clean slate.
// FOR THE TESTING PHASE ONLY. Once real athletes use TrackRecord this must never be run:
// the public ledger is supposed to be permanent.
//
// Keeps: accounts, roles, passkeys, verified athlete profiles and photos, invites, the audit log.
// Clears: qualifiers, start lists, objections, check-ins, results, selections, removals,
//         and the WHOLE ledger (it restarts at record #1, so the chain stays valid).
//
// Local emulators:  node --env-file=.env.local scripts/reset-season.mjs
// Real Firebase:    node --env-file=.env.local scripts/reset-season.mjs --prod
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { createInterface } from "node:readline/promises";

const prod = process.argv.includes("--prod");
if (prod) {
  delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
  delete process.env.FIRESTORE_EMULATOR_HOST;
}
const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT ?? "", "base64").toString("utf8"));
initializeApp({ credential: cert(sa) });
const db = getFirestore();

const COLLECTIONS = [
  "events", "startLists", "objections", "checkIns", "checkInStatus", "entries", "results",
  "selectionRules", "removals", "ledger", "ledgerHead", "ledgerDays",
];

console.log(`Target: ${prod ? `REAL Firebase project (${sa.project_id})` : "local emulators"}`);
console.log(`This permanently deletes: ${COLLECTIONS.join(", ")}`);
console.log("Accounts, roles, passkeys, athlete profiles, invites and the audit log are kept.");
const phrase = `RESET ${prod ? sa.project_id : "emulator"}`;
const rl = createInterface({ input: process.stdin, output: process.stdout });
const answer = await rl.question(`Type exactly "${phrase}" to continue: `);
rl.close();
if (answer.trim() !== phrase) {
  console.log("Cancelled. Nothing was deleted.");
  process.exit(0);
}

for (const name of COLLECTIONS) {
  await db.recursiveDelete(db.collection(name));
  console.log(`  cleared ${name}`);
}
await db.collection("auditLog").add({ action: "season.reset", by: "reset-season script", collections: COLLECTIONS, at: new Date().toISOString() });
console.log("Done. The ledger starts again at record #1. Reload the admin page.");
