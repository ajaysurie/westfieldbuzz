import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
} from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

const ADMIN_APP_NAME = "westfieldbuzz-server";
const databaseCache = new Map<string, Firestore>();
let cachedAuth: Auth | undefined;

export function resolveFirebaseAdminEnvironment(env = process.env) {
  const projectId = env.FIREBASE_PROJECT_ID ?? env.GOOGLE_CLOUD_PROJECT ?? env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = env.FIREBASE_CLIENT_EMAIL;
  const privateKey = env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  // An explicitly configured service account always wins. Vercel sets env.VERCEL but
  // supplies no Google Application Default Credentials, so treating the platform flag
  // as proof of ADC would silently ignore configured credentials and then fail at the
  // first Firestore call.
  const hasServiceAccount = Boolean(clientEmail && privateKey);
  const applicationDefaultConfigured = !hasServiceAccount
    && Boolean(env.GOOGLE_APPLICATION_CREDENTIALS || env.K_SERVICE || env.VERCEL);
  const databaseId = env.FIRESTORE_DB ?? env.NEXT_PUBLIC_FIRESTORE_DB ??
    (env.VERCEL_ENV === "production" || env.NODE_ENV === "production" ? "westfieldbuzz-prod" : "westfieldbuzz-dev");
  if (!projectId || (!applicationDefaultConfigured && (!clientEmail || !privateKey))) {
    throw new Error("Firebase Admin credentials are not configured");
  }
  return { projectId, clientEmail, privateKey, applicationDefaultConfigured, databaseId };
}

function getAdminApp() {
  const {
    projectId,
    clientEmail,
    privateKey,
    applicationDefaultConfigured,
  } = resolveFirebaseAdminEnvironment();

  return (
    getApps().find((candidate) => candidate.name === ADMIN_APP_NAME) ??
    initializeApp(
      {
        credential: applicationDefaultConfigured
          ? applicationDefault()
          : cert({ projectId, clientEmail, privateKey }),
        projectId,
      },
      ADMIN_APP_NAME
    )
  );
}

export function currentDatabaseName(): string {
  return resolveFirebaseAdminEnvironment().databaseId;
}

export function getAdminDb(databaseId = currentDatabaseName()): Firestore {
  const cached = databaseCache.get(databaseId);
  if (cached) return cached;
  const database = getFirestore(getAdminApp(), databaseId);
  databaseCache.set(databaseId, database);
  return database;
}

export function getAdminAuth(): Auth {
  if (!cachedAuth) cachedAuth = getAuth(getAdminApp());
  return cachedAuth;
}
