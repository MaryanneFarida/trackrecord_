// TESTING TOOL: changes a verified athlete's sport class (and optionally their races).
// In the real system a classification panel decides this; remove this script before launch.
//
//   node --env-file=.env.local scripts/set-class.mjs someone@example.com T54 --prod
//   node --env-file=.env.local scripts/set-class.mjs someone@example.com T54 100m,400m --prod
import { cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const args = process.argv.slice(2).filter((a) => a !== "--prod");
const [email, sportClass, races] = args;
const prod = process.argv.includes("--prod");
const CLASSES = ["T35", "T36", "T37", "T38", "T40", "T41", "T42", "T43", "T44", "T45", "T46", "T47", "T51", "T52", "T53", "T54", "T61", "T62", "T63", "T64"];
const EVENTS = ["100m", "200m", "400m", "800m", "1500m", "5000m", "10000m", "Marathon"];
if (!email || !CLASSES.includes(sportClass)) {
  console.error(`Usage: node --env-file=.env.local scripts/set-class.mjs <email> <${CLASSES.join("|")}> [races,comma,separated] [--prod]`);
  process.exit(1);
}
const events = races ? races.split(",") : null;
if (events && (events.length > 4 || events.some((e) => !EVENTS.includes(e)))) {
  console.error(`Races must be up to 4 of: ${EVENTS.join(", ")}`);
  process.exit(1);
}
if (prod) {
  delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
  delete process.env.FIRESTORE_EMULATOR_HOST;
}
const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT ?? "", "base64").toString("utf8"));
initializeApp({ credential: cert(sa) });
const user = await getAuth().getUserByEmail(email).catch(() => null);
if (!user) {
  console.error(`No user with email ${email}.`);
  process.exit(1);
}
const ref = getFirestore().collection("athletes").doc(user.uid);
const doc = await ref.get();
if (!doc.exists) {
  console.error("That account has no athlete profile.");
  process.exit(1);
}
await ref.update({ sportClass, ...(events ? { events } : {}), guideRunner: false });
await getFirestore().collection("auditLog").add({ action: "athlete.class_set", target: user.uid, sportClass, events, by: "set-class script", at: new Date().toISOString() });
console.log(`Done: ${email} is now ${sportClass}${events ? `, races ${events.join(", ")}` : ""}.`);
