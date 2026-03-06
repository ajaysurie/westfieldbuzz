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
  loading: boolean;
  loggingIn: boolean;
  loginWithFacebook: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  loggingIn: false,
  loginWithFacebook: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggingIn, setLoggingIn] = useState(false);

  // Handle redirect result when returning from Facebook on mobile
  useEffect(() => {
    getRedirectResult(auth).catch((err) => {
      console.error("[AUTH] Redirect result error:", err);
    });
  }, []);

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
    setLoggingIn(true);
    try {
      // Mobile browsers block popups — use redirect flow instead
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      if (isMobile) {
        await signInWithRedirect(auth, facebookProvider);
        // Page will redirect — loggingIn stays true until return
        return;
      }
      await signInWithPopup(auth, facebookProvider);
    } finally {
      setLoggingIn(false);
    }
  };

  const logout = async () => {
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, loading, loggingIn, loginWithFacebook, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
