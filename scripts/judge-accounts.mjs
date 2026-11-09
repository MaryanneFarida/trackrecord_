// Creates (or refreshes) the five DEMO accounts the judges use through /judges.
// They have no real inbox: the only way in is the judges' access code (JUDGE_ACCESS_CODE).
// The demo athlete is an illustrated, fictional person, not a real athlete.
//
//   node --env-file=.env.local scripts/judge-accounts.mjs --prod
import { createCipheriv, hkdfSync, randomBytes } from "node:crypto";
import { cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const prod = process.argv.includes("--prod");
if (prod) {
  delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
  delete process.env.FIRESTORE_EMULATOR_HOST;
}
const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT ?? "", "base64").toString("utf8"));
initializeApp({ credential: cert(sa) });
const auth = getAuth();
const db = getFirestore();

export const JUDGE_ACCOUNTS = {
  athlete: { email: "judge.athlete@demo.trackrecord.app", name: "Amani Wanjiru" },
  coach: { email: "judge.coach@demo.trackrecord.app", name: "Coach Otieno" },
  official: { email: "judge.official@demo.trackrecord.app", name: "Official Achieng" },
  tribunal: { email: "judge.tribunal@demo.trackrecord.app", name: "Tribunal Member Njeri" },
  admin: { email: "judge.admin@demo.trackrecord.app", name: "Admin Demo" },
};

// Same scheme as lib/crypto/files.ts (AES-256-GCM, HKDF key, bound to the record).
function seal(plain, masterHex, boundTo) {
  const key = Buffer.from(hkdfSync("sha256", Buffer.from(masterHex, "hex"), Buffer.alloc(0), "trackrecord/files/v1", 32));
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  c.setAAD(Buffer.from(boundTo, "utf8"));
  const data = Buffer.concat([c.update(plain), c.final()]);
  return { v: 1, iv, tag: c.getAuthTag(), data };
}
const AVATAR = Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAFAAUADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD6IooorAkKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKjuJ4ra3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ABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAVn67o9nrmmyWWoR74n5BHDI3ZlPYj/wCscgkVoUUNX0YJtO6PnnxZ4M1Pw45eVPtNkckXMSkqozgb/wC6Tke3PBPNczX1ZXE+I/hzo+q5ksl/s25P8UKgxnp1TgdAfu45OTmuWeH6xPQpY1bVDwmiu41T4Za9ay4s1gvoizYaOQIQB0LBsYJ9AT0Nc/N4X16KV420bUCyMVJW3ZhkehAwR7jisHCS3R2RqwlszHorV/4RvXP+gNqX/gK/+Fb1j8NfEdxKUmt4LRQud80ykE+nybjn8McUKEnsgdWEd2cZW34a8Man4in2WEOIhndcSgrEpAHBbB55HAyefTmvU/D3wx0vTpRNqUralKrZVWXZGOhGVycng9Tgg9K7uGOOGJIoUWOJFCqijAUDgADsK2hh39o5KuNS0gY/hPw5Z+GtNFtaDfK+DNOww0rf0A7Dt7kknboorqSSVkefKTk7sKKKKYgooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiuf1/xl4e8PuY9W1a2hmVgrQqTJIpIyMooLAY7kY5HqK881P47abH5f9l6NeXOc+Z9pkWHb0xjbvz39Me/Z2IlUjHdnsdFfN8/xu8TywSRpbaVCzKVEiQuWQkdRlyMj3BHtWN/wtfxp/0Gf/JWH/4inysyeJgfVNFfK3/C1/Gn/QZ/8lYf/iK1bH41+Kba1SKaPTbuRc5mmgYO3OedjKvHTgDpRysFiYH0pRXiujfHa2bamtaNNFiMbpbSQPufjOEbbtU8n7xI4HPWvQPDvxA8M6/5aWWqQx3L7B9nuf3Um5uiANwzZ4+Unn6jKszSNWEtmdVRRRSNAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKgvry2sLV7m+uIba2TG6WZwiLk4GSeByQPxr59+I3xbvtUnnsPDMr2emqwAu0LJPNgnJBz8ik44+9gckZK00rmc6igtT1Hxl8TdA8M+bB5/2/UUyv2a2Ibaw3DDv0XDLgjlhkHaa8O8ZfE3X/ABN5sHn/AGDTnyv2a2JXcp3DDv1bKtgjhTgHaK4eirSscU60phRRRTMgooooAKKKKACiiigDqvCPj7X/AArtj06782zH/LpcgvF/F0GQV5Yn5SMnrmvcfCPxc0DXNsOot/ZF4f4blwYj948S8DoB94LycDNfMlFJq5rCtKB9w0V8w/D74oap4ZeK0v2fUNI3KGjkYtJCgG3ERJ4AGPlPHGBtyTX0ho2r6frdit5pN3Dd2zY+eJs7TgHaw6q2CMg4IzzUNWO2nVU9i9RRRSNAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKqarqNppOnT32ozpb2kC7pJH6Af1JOAAOSSAKkv7uCwsbi8u38u2t42llfBO1VGScDk8DtXyz8S/Hl34y1EKge30iBibe2J5J6eY+OrEfgoOB3JaVzKrUVNeYfEvx5d+MtRCoHt9IgYm3tieSenmPjqxH4KDgdyeLpVUuwVQWYnAAGSTXR6f4dG0PfMd2QQiHjHoT/h+dTVrQoq8mZ4XB18dNqmr930RzdFdr/Ymn/8+/8A4+3+NH9iaf8A8+//AI+3+Ncv9o0uz/r5nqf6t4r+aP3v/I4qiu1/sTT/APn3/wDH2/xo/sTT/wDn3/8AH2/xo/tGl2f9fMP9W8V/NH73/kcVRXa/2Jp//Pv/AOPt/jR/Ymn/APPv/wCPt/jR/aNLs/6+Yf6t4r+aP3v/ACOKortf7E0//n3/APH2/wAaP7E0/wD59/8Ax9v8aP7Rpdn/AF8w/wBW8V/NH73/AJHFUV2v9iaf/wA+/wD4+3+NH9iaf/z7/wDj7f40f2jS7P8Ar5h/q3iv5o/e/wDI4qiu1/sTT/8An3/8fb/Gj+xNP/59/wDx9v8AGj+0aXZ/18w/1bxX80fvf+RxVdH4F8Xah4P1gXlifMgfC3FszYSZR29mGThu3uCQZr7w7C6lrNjG+RhWOVx/P+dczPE8ErRSqVdTgg100cRCsvdPMxeAr4GS9ovRrY+yfDGv6f4l0eHUtKm8yB+GU8PG3dGHZhn+RGQQa1a+QfAvi7UPB+sC8sT5kD4W4tmbCTKO3swycN29wSD9WeHdZtPEGi2uqacXNrcqWXeu1gQSCCPUEEcZHHBI5q2rFUqqmvM0qKKKRsFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUVwfxi8Wr4Y8LyRW8jpqeoK0NsVB+QcB33AjaVDcHOdxXggHATKSirs8y+OXjiXVNVl0DTZ3XTbRtl0ApXzp1Y5BPdVIGBgDcCecKa8noorRKx5s5Obuza8LWqzXkk0iqyxAYB7Meh/Q11lc14QdRJdRk/OwVgPYZz/MV0teFjm3WaZ95kMYxwUXHd3v8Af/kFFFFch7IVoaVZQ3aXslzPJDFawCYmOISM2ZETABZf7+evas+tDSr2G0S9juYJJorqAQkRyiNlxIj5BKt/cx07042vqRO9vdLz6Jaw2L3097N9kJi8lo7cMzh/N6guNuDEwPJ5pf8AhHg1ro08V1uj1B3DZjx5Cq7LuPPOQrH8D9alt/EohtpbaOK7gg/dCL7Nd+U6KnmcFtp3ZMpY8Dmol8Q7NPNotsSBbtCjtLkqxeU7zxz8szrj159q1/d/1c5/3/4+W1v8xb7QbXTrx7e/1B42M8kUTLBuBVHKb3+YbQWU9Nx4PtnFu7eS0u5racbZYXaNx6MDg/yravtettRvHuL/AE9pGE8ksSrPtAV3L7H+U7gGY9Np5PtjFu7iS7u5rmc7pZnaRz6sTk/zqZ8v2TWl7T7f6ENFFFZmwUUUUAFc54stVAiuUVQxOxz3bjj+R/SujrD8WuosoYyfnaTcB7AHP8xXTg21WjY8vOYxlgp83T87nK13nwm8cS+E9aSG8ncaHct/pMe0v5bYwJFHYg4zjOV7EhccHRXvn57GTi7o+4aK8n+Afi1dT0U6BdyO1/YKWiLAnfb5AHzEnlS23HHy7cZwcesVD0PThJSV0FFFFIoKKKKACiiigAooooAKKKKACiiigAooooAKKKKACvkj4m+Jf+Eq8X3d9E2bOP8A0e14/wCWSk4PQH5iWbB5G7HavePjdr6aN4GurdJtl5qP+ixKNpJU/wCsJB/h2ZXIBwWXpnNfLtXFHHiZ/ZCiiiqOUnsbp7O6SaMng/MAcbh3FdtY3sF7GXt3zjG5TwV+tcFSqxRgykqwOQQcEGuTE4WNfXZnrZbm1TA3ja8X0/yPRaK4H7fef8/Vx/38P+NH2+8/5+rj/v4f8a4/7Nl/Me3/AKzUv+fb+9HfUVwP2+8/5+rj/v4f8aPt95/z9XH/AH8P+NH9my/mD/Wal/z7f3o76iuB+33n/P1cf9/D/jR9vvP+fq4/7+H/ABo/s2X8wf6zUv8An2/vR31FcD9vvP8An6uP+/h/xo+33n/P1cf9/D/jR/Zsv5g/1mpf8+396O+orgft95/z9XH/AH8P+NH2+8/5+rj/AL+H/Gj+zZfzB/rNS/59v70d9RXA/b7z/n6uP+/h/wAaPt95/wA/Vx/38P8AjR/Zsv5g/wBZqX/Pt/ejubq5htYvMuHCJnGT61xerXzX90X+YRDhFPYf/XqpJI8rl5HZ3PVmOSabXXhsJGi+Zu7PHzLOJ41ezS5Y/n6/5BRRRXYeMavhXWp/DviGw1a2G6S2k3FMgb1PDLkg4ypIzjjOa+xbC7gv7G3vLR/MtriNZYnwRuVhkHB5HB718S19C/s76+l34eudEmmzc2UhliQ7R+5fn5e5w+4kkcb157CZI6cNOz5T1yiiioO0KKKKACiiigAooooA/9k=", "base64");

console.log(`Target: ${prod ? `REAL Firebase project (${sa.project_id})` : "local emulators"}`);
for (const [role, a] of Object.entries(JUDGE_ACCOUNTS)) {
  let user = await auth.getUserByEmail(a.email).catch(() => null);
  if (!user) user = await auth.createUser({ email: a.email, displayName: a.name, emailVerified: false });
  else await auth.updateUser(user.uid, { displayName: a.name });
  await auth.setCustomUserClaims(user.uid, { role });
  await db.collection("users").doc(user.uid).set({ email: a.email, role, demo: true }, { merge: true });
  if (role === "athlete") {
    const now = new Date().toISOString();
    const key = process.env.FILE_ENCRYPTION_KEY;
    await db.collection("athletePrivate").doc(user.uid).set({
      idPhoto: seal(AVATAR, key, `athlete:${user.uid}:idPhoto`),
      selfie: seal(AVATAR, key, `athlete:${user.uid}:selfie`),
      updatedAt: now,
    });
    await db.collection("athletes").doc(user.uid).set({
      email: a.email, fullName: a.name, licenceNo: "DEMO-001", sportClass: "T54", events: ["100m", "200m"],
      guideRunner: false, consentAt: now, status: "verified", submittedAt: now, verifiedAt: now, rejectionCode: null, rejectionNote: null, demo: true,
    }, { merge: true });
  }
  console.log(`  ${role.padEnd(9)} ${a.name}`);
}
await db.collection("auditLog").add({ action: "judges.accounts_ready", by: "judge-accounts script", at: new Date().toISOString() });
console.log("Done. Set JUDGE_ACCESS_CODE in Vercel (12+ characters) and redeploy to open /judges.");
