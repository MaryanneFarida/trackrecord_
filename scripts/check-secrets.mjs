// Checks .env.local secrets work, without printing them.
// Run: node --env-file=.env.local scripts/check-secrets.mjs
import { createPrivateKey, createPublicKey, sign, verify } from "node:crypto";

const env = process.env;
const fix = (s = "") => s.replace(/\\n/g, "\n");
let ok = true;
const check = (name, fn) => {
  try { fn(); console.log(`OK    ${name}`); }
  catch (e) { ok = false; console.log(`FAIL  ${name}: ${e.message}`); }
};

check("Signing key pair signs and verifies", () => {
  const priv = createPrivateKey(fix(env.SIGNING_PRIVATE_KEY));
  const pub = createPublicKey(fix(env.SIGNING_PUBLIC_KEY));
  const msg = Buffer.from("trackrecord-test-record");
  if (!verify(null, msg, pub, sign(null, msg, priv))) throw new Error("signature did not verify");
});
check("File encryption key is 32 bytes", () => {
  if (Buffer.from(env.FILE_ENCRYPTION_KEY ?? "", "hex").length !== 32) throw new Error("wrong length");
});
check("TOTP and cron secrets are long enough", () => {
  if ((env.TOTP_MASTER_SECRET ?? "").length < 32 || (env.CRON_SECRET ?? "").length < 32) throw new Error("too short");
});
check("Firebase service account decodes", () => {
  const sa = JSON.parse(Buffer.from(env.FIREBASE_SERVICE_ACCOUNT ?? "", "base64").toString("utf8"));
  if (sa.project_id !== env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) throw new Error("project id does not match");
});

console.log(ok ? "\nAll secrets look good." : "\nSome secrets need fixing.");
process.exit(ok ? 0 : 1);
