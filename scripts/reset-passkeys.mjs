// Removes all passkeys for a user who lost their phone, so they can set up a new one.
// Admin-only. Every reset is written to the audit log, so it can never happen silently.
//
// Local emulators:  node --env-file=.env.local scripts/reset-passkeys.mjs someone@example.com
// Real Firebase:    node --env-file=.env.local scripts/reset-passkeys.mjs someone@example.com --prod
import { cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const [email] = process.argv.slice(2);
const prod = process.argv.includes("--prod");
if (!email) {
  console.error("Usage: node --env-file=.env.local scripts/reset-passkeys.mjs <email> [--prod]");
  process.exit(1);
}
if (prod) {
  delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
  delete process.env.FIRESTORE_EMULATOR_HOST;
}
console.log(`Target: ${prod ? "REAL Firebase project" : "local emulators"}`);

const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT ?? "", "base64").toString("utf8"));
initializeApp({ credential: cert(sa) });
const db = getFirestore();

const user = await getAuth().getUserByEmail(email).catch(() => null);
if (!user) {
  console.error(`No user with email ${email}.`);
  process.exit(1);
}
const keys = await db.collection("users").doc(user.uid).collection("passkeys").get();
const batch = db.batch();
keys.docs.forEach((d) => batch.delete(d.ref));
batch.set(db.collection("users").doc(user.uid), { passkeyCount: 0 }, { merge: true });
await batch.commit();
await getAuth().revokeRefreshTokens(user.uid); // sign them out everywhere
await db.collection("auditLog").add({
  action: "passkey.reset",
  uid: user.uid,
  email,
  removed: keys.size,
  by: "reset-passkeys script",
  at: new Date().toISOString(),
});
console.log(`Done: removed ${keys.size} passkey(s) for ${email} and signed them out. They set up a new one at next sign-in.`);
