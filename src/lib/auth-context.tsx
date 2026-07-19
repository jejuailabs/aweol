'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut as firebaseSignOut } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './firebase';
import { UserDoc, UserRole } from './firestore-schema';

interface AuthState {
  user: User | null;
  userDoc: UserDoc | null;
  role: UserRole | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  user: null,
  userDoc: null,
  role: null,
  loading: true,
  signInWithGoogle: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userDoc, setUserDoc] = useState<UserDoc | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser && db) {
        const ref = doc(db, 'users', firebaseUser.uid);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          setUserDoc(snap.data() as UserDoc);
        } else {
          const newUser: UserDoc = {
            displayName: firebaseUser.displayName || '',
            photoURL: firebaseUser.photoURL || '',
            role: null,
            classIds: [],
            children: [],
            pendingClassRequest: null,
            avatarId: null,
            avatarCustom: { hat: null, accessory: null },
            preferences: { theme: 'light' },
            createdAt: serverTimestamp() as any,
          };
          await setDoc(ref, newUser);
          setUserDoc(newUser);
        }
      } else {
        setUserDoc(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    if (!auth) return;
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };

  const signOut = async () => {
    if (!auth) return;
    await firebaseSignOut(auth);
    setUserDoc(null);
  };

  return (
    <AuthContext.Provider value={{ user, userDoc, role: userDoc?.role ?? null, loading, signInWithGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
