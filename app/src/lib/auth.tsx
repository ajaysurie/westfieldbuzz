"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  linkWithPopup,
  sendSignInLinkToEmail,
  signInWithEmailLink,
  isSignInWithEmailLink,
  signOut,
  type User,
} from "firebase/auth";
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { auth, db, facebookProvider, googleProvider } from "./firebase";
import {
  authResumeDestination,
  isAuthContinuationId,
  readAuthContinuation,
  safeLocalReturnPath,
} from "./auth-continuation";

interface AuthContextType {
  user: User | null;
  photoURL: string;
  loading: boolean;
  loggingIn: boolean;
  authError: string;
  emailLinkSent: boolean;
  loginWithFacebook: () => Promise<void>;
  loginWithGoogle: (returnTo?: string, continuation?: string | null) => Promise<void>;
  sendEmailLink: (email: string, returnTo?: string, continuation?: string | null) => Promise<void>;
  completeEmailLink: (email: string) => Promise<{ destination: string; continuationMissing: boolean }>;
  linkFacebook: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  photoURL: "",
  loading: true,
  loggingIn: false,
  authError: "",
  emailLinkSent: false,
  loginWithFacebook: async () => {},
  loginWithGoogle: async () => {},
  sendEmailLink: async () => {},
  completeEmailLink: async () => ({ destination: "/", continuationMissing: false }),
  linkFacebook: async () => {},
  logout: async () => {},
});

const isMobile =
  typeof navigator !== "undefined" &&
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

const EMAIL_STORAGE_KEY = "westfieldbuzz:emailForSignIn";
const RETURN_TO_STORAGE_KEY = "westfieldbuzz:returnTo";
const CONTINUATION_STORAGE_KEY = "westfieldbuzz:authContinuation";

export const safeReturnTo = safeLocalReturnPath;

export function readStoredAuthResume(): { returnTo: string; continuation: string | null } {
  if (typeof window === "undefined") return { returnTo: "/", continuation: null };
  const continuationId = window.localStorage.getItem(CONTINUATION_STORAGE_KEY);
  const continuation = isAuthContinuationId(continuationId) && readAuthContinuation(continuationId)
    ? continuationId
    : null;
  if (!continuation) window.localStorage.removeItem(CONTINUATION_STORAGE_KEY);
  return {
    returnTo: safeReturnTo(window.localStorage.getItem(RETURN_TO_STORAGE_KEY)),
    continuation,
  };
}

export function clearStoredAuthResume(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(RETURN_TO_STORAGE_KEY);
  window.localStorage.removeItem(CONTINUATION_STORAGE_KEY);
}

function storeAuthResume(returnTo: string, continuation: string | null | undefined): void {
  const safeDestination = safeReturnTo(returnTo);
  window.localStorage.setItem(RETURN_TO_STORAGE_KEY, safeDestination);
  if (isAuthContinuationId(continuation)) window.localStorage.setItem(CONTINUATION_STORAGE_KEY, continuation);
  else window.localStorage.removeItem(CONTINUATION_STORAGE_KEY);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [photoURL, setPhotoURL] = useState("");
  const [loading, setLoading] = useState(true);
  const [loggingIn, setLoggingIn] = useState(false);
  const [authError, setAuthError] = useState("");
  const [emailLinkSent, setEmailLinkSent] = useState(false);
  const reconciledUserId = useRef<string | null>(null);

  // Handle redirect result when returning from OAuth provider (mobile flow)
  useEffect(() => {
    getRedirectResult(auth)
      .then((result) => {
        if (result?.user) {
          console.log("[AUTH] Redirect sign-in successful");
        }
      })
      .catch((err) => {
        console.error("[AUTH] Redirect result error:", err);
        const code = (err as { code?: string }).code || "";
        clearStoredAuthResume();
        if (code === "auth/account-exists-with-different-credential") {
          setAuthError("An account already exists with that email. Try the other sign-in method, then link accounts from your account page.");
        } else if (code !== "auth/redirect-cancelled-by-user") {
          setAuthError(`Sign-in failed: ${code}`);
        }
      });
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      // Build a stable Facebook photo URL from providerData UID
      // Firebase's photoURL can be null or expired; the Graph API URL is stable
      let photoURL = firebaseUser?.photoURL || "";
      const fbProvider = firebaseUser?.providerData?.find(p => p.providerId === "facebook.com");
      if (fbProvider?.uid) {
        photoURL = `https://graph.facebook.com/${fbProvider.uid}/picture?type=large`;
      }
      console.log("[AUTH] photoURL:", photoURL);

      setUser(firebaseUser);
      setPhotoURL(photoURL);
      setLoading(false);
      setLoggingIn(false);

      if (firebaseUser) {
        try {
          const userRef = doc(db, "users", firebaseUser.uid);
          const userSnap = await getDoc(userRef);

          if (!userSnap.exists()) {
            await setDoc(userRef, {
              displayName: firebaseUser.displayName || "",
              photoURL,
              email: firebaseUser.email || "",
              joinedDate: serverTimestamp(),
              lastActive: serverTimestamp(),
            });
          } else {
            await setDoc(userRef, { lastActive: serverTimestamp() }, { merge: true });
          }

          await setDoc(doc(db, "public_profiles", firebaseUser.uid), {
            displayName: firebaseUser.displayName || "",
            photoURL,
          });
        } catch (err) {
          console.error("[AUTH] Failed to sync user profile:", err);
        }

        // Link only an already-consented subscriber through the authenticated
        // server boundary. A failed reconciliation never blocks sign-in.
        if (firebaseUser.emailVerified && firebaseUser.email && reconciledUserId.current !== firebaseUser.uid) {
          reconciledUserId.current = firebaseUser.uid;
          void firebaseUser.getIdToken().then((token) => fetch("/api/account/preferences", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ reconcile: true }),
          })).catch(() => undefined);
        }
      } else {
        reconciledUserId.current = null;
      }
    });

    return () => unsubscribe();
  }, []);

  const loginWithFacebook = async () => {
    if (loggingIn) return;
    setLoggingIn(true);
    setAuthError("");

    if (isMobile) {
      // Mobile: use redirect (popups unreliable on mobile browsers)
      signInWithRedirect(auth, facebookProvider).catch((err) => {
        console.error("[AUTH] Redirect error:", err);
        setLoggingIn(false);
        setAuthError("Sign-in failed. Please try again.");
      });
    } else {
      // Desktop: use popup
      try {
        await signInWithPopup(auth, facebookProvider);
      } catch (err) {
        const code = (err as { code?: string }).code || "";
        if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
          // User closed the popup — not an error
        } else if (code === "auth/popup-blocked") {
          setAuthError("Pop-up blocked. Please allow pop-ups for this site.");
        } else if (code === "auth/account-exists-with-different-credential") {
          setAuthError("An account already exists with that email. Try signing in with Google instead, then link Facebook from your account page.");
        } else {
          setAuthError(`Sign-in failed: ${code || "unknown error"}`);
        }
      } finally {
        setLoggingIn(false);
      }
    }
  };

  const loginWithGoogle = async (returnTo = "/", continuation: string | null = null) => {
    if (loggingIn) return;
    setLoggingIn(true);
    setAuthError("");
    storeAuthResume(returnTo, continuation);

    if (isMobile) {
      signInWithRedirect(auth, googleProvider).catch((err) => {
        console.error("[AUTH] Google redirect error:", err);
        clearStoredAuthResume();
        setLoggingIn(false);
        setAuthError("Sign-in failed. Please try again.");
      });
    } else {
      try {
        await signInWithPopup(auth, googleProvider);
      } catch (err) {
        clearStoredAuthResume();
        const code = (err as { code?: string }).code || "";
        if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
          // User closed the popup — not an error
        } else if (code === "auth/popup-blocked") {
          setAuthError("Pop-up blocked. Please allow pop-ups for this site.");
        } else if (code === "auth/account-exists-with-different-credential") {
          setAuthError("An account already exists with that email. Use the same sign-in method you used before, or request an email sign-in link.");
        } else {
          setAuthError(`Sign-in failed: ${code || "unknown error"}`);
        }
      } finally {
        setLoggingIn(false);
      }
    }
  };

  const sendEmailLink = async (email: string, returnTo = "/", continuation: string | null = null) => {
    if (loggingIn) return;
    setLoggingIn(true);
    setEmailLinkSent(false);
    setAuthError("");

    try {
      const safeDestination = safeReturnTo(returnTo);
      const finishUrl = new URL("/auth/finish", window.location.origin);
      finishUrl.searchParams.set("returnTo", safeDestination);
      if (isAuthContinuationId(continuation)) finishUrl.searchParams.set("continuation", continuation);
      await sendSignInLinkToEmail(auth, email.trim(), {
        url: finishUrl.toString(),
        handleCodeInApp: true,
      });
      window.localStorage.setItem(EMAIL_STORAGE_KEY, email.trim());
      storeAuthResume(safeDestination, continuation);
      setEmailLinkSent(true);
    } catch (err) {
      const code = (err as { code?: string }).code || "";
      setAuthError(
        code === "auth/invalid-email"
          ? "Enter a valid email address."
          : "We could not send the sign-in link. Please try again."
      );
    } finally {
      setLoggingIn(false);
    }
  };

  const completeEmailLink = async (email: string) => {
    if (typeof window === "undefined" || !isSignInWithEmailLink(auth, window.location.href)) {
      throw new Error("This sign-in link is invalid or has expired.");
    }
    setLoggingIn(true);
    setAuthError("");
    try {
      await signInWithEmailLink(auth, email.trim(), window.location.href);
      const url = new URL(window.location.href);
      const storedResume = readStoredAuthResume();
      const returnTo = safeReturnTo(url.searchParams.get("returnTo") || storedResume.returnTo);
      const requestedContinuation = url.searchParams.get("continuation");
      const continuationId = isAuthContinuationId(requestedContinuation)
        ? requestedContinuation
        : storedResume.continuation;
      const continuation = readAuthContinuation(continuationId);
      const continuationMissing = Boolean(continuationId && !continuation);
      const destination = authResumeDestination(returnTo, continuation ? continuationId : null);
      window.localStorage.removeItem(EMAIL_STORAGE_KEY);
      clearStoredAuthResume();
      return { destination, continuationMissing };
    } finally {
      setLoggingIn(false);
    }
  };

  const linkFacebook = async () => {
    if (!user) return;
    setAuthError("");
    try {
      await linkWithPopup(user, facebookProvider);
    } catch (err) {
      const code = (err as { code?: string }).code || "";
      if (code === "auth/credential-already-in-use") {
        setAuthError("That Facebook account is already linked to a different user.");
      } else if (code === "auth/provider-already-linked") {
        setAuthError("Facebook is already linked to your account.");
      } else if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
        // User closed the popup — not an error
      } else {
        setAuthError(`Link failed: ${code || "unknown error"}`);
      }
    }
  };

  const logout = async () => {
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, photoURL, loading, loggingIn, authError, emailLinkSent, loginWithFacebook, loginWithGoogle, sendEmailLink, completeEmailLink, linkFacebook, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
