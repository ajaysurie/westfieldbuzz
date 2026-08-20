import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function databaseName(): string {
  const configured =
    process.env.FIRESTORE_DB ?? process.env.NEXT_PUBLIC_FIRESTORE_DB;
  if (configured) return configured;
  return process.env.VERCEL_ENV === "production"
    ? "westfieldbuzz-prod"
    : "westfieldbuzz-dev";
}

export function serverFirestore(name = databaseName()) {
  const app =
    getApps()[0] ??
    initializeApp({
      credential: applicationDefault(),
      projectId: process.env.GOOGLE_CLOUD_PROJECT ?? "westfieldbuzz",
    });
  return getFirestore(app, name);
}

export function currentDatabaseName(): string {
  return databaseName();
}
