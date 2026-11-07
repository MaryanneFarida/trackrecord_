import "server-only";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { serverEnv } from "@/lib/env";

/**
 * Firebase Admin SDK, server routes only.
 * WARNING: the Admin SDK ignores Firestore Security Rules, so every route
 * that writes with it must repeat its own checks (role, time window, status).
 */
function adminApp(): App {
  const existing = getApps()[0];
  if (existing) return existing;
  const json = Buffer.from(serverEnv().FIREBASE_SERVICE_ACCOUNT, "base64").toString("utf8");
  return initializeApp({ credential: cert(JSON.parse(json)) });
}

export const adminAuth = () => getAuth(adminApp());
export const adminDb = () => getFirestore(adminApp());
