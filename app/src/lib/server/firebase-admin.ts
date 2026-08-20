import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
} from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

let cachedDb: Firestore | undefined;

export function getAdminDb(): Firestore {
  if (cachedDb) return cachedDb;

  const projectId =
    process.env.FIREBASE_PROJECT_ID ??
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const hasApplicationDefault = Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS);
  if (!projectId || (!hasApplicationDefault && (!clientEmail || !privateKey))) {
    throw new Error("Firebase Admin credentials are not configured");
  }

  const app =
    getApps().find((candidate) => candidate.name === "westfieldbuzz-server") ??
    initializeApp(
      {
        credential: hasApplicationDefault
          ? applicationDefault()
          : cert({ projectId, clientEmail, privateKey }),
        projectId,
      },
      "westfieldbuzz-server"
    );

  const databaseId =
    process.env.FIRESTORE_DB ??
    process.env.NEXT_PUBLIC_FIRESTORE_DB ??
    (process.env.NODE_ENV === "development"
      ? "westfieldbuzz-dev"
      : "westfieldbuzz-prod");

  cachedDb = getFirestore(app, databaseId);
  return cachedDb;
}
