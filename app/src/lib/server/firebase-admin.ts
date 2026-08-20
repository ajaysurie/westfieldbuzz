import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

let cachedDb: Firestore | undefined;

export function getAdminDb(): Firestore {
  if (cachedDb) return cachedDb;

  const app =
    getApps()[0] ??
    initializeApp({
      credential: applicationDefault(),
      projectId:
        process.env.FIREBASE_PROJECT_ID ??
        process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ??
        "westfieldbuzz",
    });

  const databaseId =
    process.env.FIRESTORE_DB ??
    process.env.NEXT_PUBLIC_FIRESTORE_DB ??
    (process.env.NODE_ENV === "development"
      ? "westfieldbuzz-dev"
      : "westfieldbuzz-prod");

  cachedDb = getFirestore(app, databaseId);
  return cachedDb;
}
