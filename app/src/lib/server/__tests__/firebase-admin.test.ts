import { describe, expect, it } from "vitest";
import { resolveFirebaseAdminEnvironment } from "../firebase-admin";

/** Build a ProcessEnv-shaped object without dragging in the real environment. */
function env(overrides: Record<string, string>): NodeJS.ProcessEnv {
  return overrides as unknown as NodeJS.ProcessEnv;
}

const SERVICE_ACCOUNT = {
  FIREBASE_PROJECT_ID: "westfieldbuzz",
  FIREBASE_CLIENT_EMAIL: "crawler@westfieldbuzz.iam.gserviceaccount.com",
  FIREBASE_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n",
};

describe("resolveFirebaseAdminEnvironment", () => {
  it("prefers an explicit service account over platform ADC on Vercel", () => {
    // Vercel sets VERCEL but provides no ADC. Honouring the platform flag here would
    // discard the configured credentials and 500 on the first Firestore call.
    const resolved = resolveFirebaseAdminEnvironment(env({ ...SERVICE_ACCOUNT, VERCEL: "1" }));

    expect(resolved.applicationDefaultConfigured).toBe(false);
    expect(resolved.clientEmail).toBe(SERVICE_ACCOUNT.FIREBASE_CLIENT_EMAIL);
  });

  it("unescapes newlines in the private key", () => {
    const resolved = resolveFirebaseAdminEnvironment(env({ ...SERVICE_ACCOUNT, VERCEL: "1" }));

    expect(resolved.privateKey).toContain("\n");
    expect(resolved.privateKey).not.toContain("\\n");
  });

  it("falls back to application default credentials when no service account is set", () => {
    const resolved = resolveFirebaseAdminEnvironment(
      env({ FIREBASE_PROJECT_ID: "westfieldbuzz", K_SERVICE: "crawler" })
    );

    expect(resolved.applicationDefaultConfigured).toBe(true);
  });

  it("throws when neither credentials nor an ADC platform are present", () => {
    expect(() =>
      resolveFirebaseAdminEnvironment(env({ FIREBASE_PROJECT_ID: "westfieldbuzz" }))
    ).toThrow(/not configured/i);
  });

  it("prefers FIRESTORE_DB over the public database name", () => {
    const resolved = resolveFirebaseAdminEnvironment(
      env({
        ...SERVICE_ACCOUNT,
        FIRESTORE_DB: "westfieldbuzz-dev",
        NEXT_PUBLIC_FIRESTORE_DB: "westfieldbuzz-prod",
      })
    );

    expect(resolved.databaseId).toBe("westfieldbuzz-dev");
  });
});
