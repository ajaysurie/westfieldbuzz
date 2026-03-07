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
  signOut,
  type User,
} from "firebase/auth";
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { auth, db, facebookProvider } from "./firebase";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  loggingIn: boolean;
  authError: string;
  loginWithFacebook: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  loggingIn: false,
  authError: "",
  loginWithFacebook: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggingIn, setLoggingIn] = useState(false);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);

      if (firebaseUser) {
        try {
          const userRef = doc(db, "users", firebaseUser.uid);
          const userSnap = await getDoc(userRef);

          if (!userSnap.exists()) {
            await setDoc(userRef, {
              displayName: firebaseUser.displayName || "",
              photoURL: firebaseUser.photoURL || "",
              email: firebaseUser.email || "",
              joinedDate: serverTimestamp(),
              lastActive: serverTimestamp(),
            });
          } else {
            await setDoc(userRef, { lastActive: serverTimestamp() }, { merge: true });
          }

          await setDoc(doc(db, "public_profiles", firebaseUser.uid), {
            displayName: firebaseUser.displayName || "",
            photoURL: firebaseUser.photoURL || "",
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
    try {
      await signInWithPopup(auth, facebookProvider);
    } catch (err) {
      const code = (err as { code?: string }).code || "";
      if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
        // User closed the popup — not an error
      } else if (code === "auth/popup-blocked") {
        setAuthError("Pop-up blocked. Please allow pop-ups for this site.");
      } else if (code === "auth/network-request-failed") {
        setAuthError("Network error. Check your connection and try again.");
      } else {
        setAuthError("Sign-in failed. Please try again.");
      }
    } finally {
      setLoggingIn(false);
    }
  };

  const logout = async () => {
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, loading, loggingIn, authError, loginWithFacebook, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
