// Generates every TrackRecord secret in .env format. Run ONCE per environment.
// Never commit the output.
import { generateKeyPairSync, randomBytes, createHash } from "node:crypto";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const privPem = privateKey.export({ type: "pkcs8", format: "pem" });
const pubPem = publicKey.export({ type: "spki", format: "pem" });
const pubDer = publicKey.export({ type: "spki", format: "der" });
const keyId = "k" + createHash("sha256").update(pubDer).digest("hex").slice(0, 12);
const oneLine = (s) => JSON.stringify(s.trim()); // keeps line breaks as \n

console.log("");
console.log(`# --- TrackRecord secrets, generated ${new Date().toISOString()} ---`);
console.log(`SIGNING_KEY_ID=${keyId}`);
console.log(`SIGNING_PRIVATE_KEY=${oneLine(privPem)}`);
console.log(`SIGNING_PUBLIC_KEY=${oneLine(pubPem)}`);
console.log(`FILE_ENCRYPTION_KEY=${randomBytes(32).toString("hex")}`);
console.log(`TOTP_MASTER_SECRET=${randomBytes(32).toString("hex")}`);
console.log(`CRON_SECRET=${randomBytes(32).toString("hex")}`);
console.error(`Public key fingerprint (safe to publish): ${keyId}`);
