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
  loginWithFacebook: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  loginWithFacebook: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);

      if (firebaseUser) {
        // Create/update user docs on login
        const userRef = doc(db, "users", firebaseUser.uid);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
          // First-time user
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

        // Public profile (always update)
        await setDoc(doc(db, "public_profiles", firebaseUser.uid), {
          displayName: firebaseUser.displayName || "",
          photoURL: firebaseUser.photoURL || "",
        });
      }
    });

    return () => unsubscribe();
  }, []);

  const loginWithFacebook = async () => {
    await signInWithPopup(auth, facebookProvider);
  };

  const logout = async () => {
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, loading, loginWithFacebook, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
