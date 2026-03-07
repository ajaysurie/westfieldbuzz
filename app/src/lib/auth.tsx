"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  type User,
} from "firebase/auth";
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { auth, db, facebookProvider } from "./firebase";

interface AuthContextType {
  user: User | null;
  photoURL: string;
  loading: boolean;
  loggingIn: boolean;
  authError: string;
  loginWithFacebook: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  photoURL: "",
  loading: true,
  loggingIn: false,
  authError: "",
  loginWithFacebook: async () => {},
  logout: async () => {},
});

const isMobile =
  typeof navigator !== "undefined" &&
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [photoURL, setPhotoURL] = useState("");
  const [loading, setLoading] = useState(true);
  const [loggingIn, setLoggingIn] = useState(false);
  const [authError, setAuthError] = useState("");

  // Handle redirect result when returning from Facebook (mobile flow)
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
        if (code !== "auth/redirect-cancelled-by-user") {
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
        } else {
          setAuthError(`Sign-in failed: ${code || "unknown error"}`);
        }
      } finally {
        setLoggingIn(false);
      }
    }
  };

  const logout = async () => {
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, photoURL, loading, loggingIn, authError, loginWithFacebook, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
