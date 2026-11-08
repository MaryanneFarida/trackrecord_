// Gives a user a TrackRecord role (a Firebase custom claim). Admin-only tool.
//
// Local emulators:  node --env-file=.env.local scripts/set-role.mjs someone@example.com admin
// Real Firebase:    node --env-file=.env.local scripts/set-role.mjs someone@example.com admin --prod
//
// The user must sign out and in again for a new role to take effect.
import { cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const ROLES = ["athlete", "coach", "official", "doctor", "admin", "tribunal", "none"];
const [email, role] = process.argv.slice(2);
const prod = process.argv.includes("--prod");

if (!email || !ROLES.includes(role)) {
  console.error(`Usage: node --env-file=.env.local scripts/set-role.mjs <email> <${ROLES.join("|")}> [--prod]`);
  process.exit(1);
}
if (prod) {
  delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
  delete process.env.FIRESTORE_EMULATOR_HOST;
}
console.log(`Target: ${prod ? "REAL Firebase project" : "local emulators"}`);

const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT ?? "", "base64").toString("utf8"));
initializeApp({ credential: cert(sa) });

const user = await getAuth().getUserByEmail(email).catch(() => null);
if (!user) {
  console.error(`No user with email ${email}. They must sign in once first.`);
  process.exit(1);
}
const claims = role === "none" ? {} : { role };
await getAuth().setCustomUserClaims(user.uid, claims);
await getAuth().revokeRefreshTokens(user.uid); // old sessions end; the next sign-in carries the new role
await getFirestore()
  .collection("auditLog")
  .add({ action: "role.set", target: user.uid, email, role, by: "set-role script", at: new Date().toISOString() });
console.log(`Done: ${email} is now "${role}". They must sign in again.`);
