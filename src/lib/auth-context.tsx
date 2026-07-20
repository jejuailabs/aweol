'use client';

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { User, onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut as firebaseSignOut } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './firebase';
import { UserDoc, UserRole } from './firestore-schema';

export interface ViewAs {
  role: UserRole;
  classId: string;
}

interface AuthState {
  user: User | null;
  /** 역할 테스트 중이면 가장한 값이 반영된 문서 */
  userDoc: UserDoc | null;
  /** 화면 표시에 쓰는 역할 (테스트 중이면 가장한 역할) */
  role: UserRole | null;
  /** 실제 계정 역할 — 권한 판단의 기준 */
  actualRole: UserRole | null;
  loading: boolean;
  viewAs: ViewAs | null;
  setViewAs: (v: ViewAs | null) => void;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  user: null,
  userDoc: null,
  role: null,
  actualRole: null,
  loading: true,
  viewAs: null,
  setViewAs: () => {},
  signInWithGoogle: async () => {},
  signOut: async () => {},
});

const VIEW_AS_KEY = 'aewol.viewAs';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [realDoc, setRealDoc] = useState<UserDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewAs, setViewAsState] = useState<ViewAs | null>(null);

  // 새로고침해도 테스트 모드가 유지되도록 (탭을 닫으면 해제)
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(VIEW_AS_KEY);
      if (saved) setViewAsState(JSON.parse(saved));
    } catch {}
  }, []);

  const setViewAs = useCallback((v: ViewAs | null) => {
    setViewAsState(v);
    try {
      if (v) sessionStorage.setItem(VIEW_AS_KEY, JSON.stringify(v));
      else sessionStorage.removeItem(VIEW_AS_KEY);
    } catch {}
  }, []);

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }

    // 문서 구독을 계정 전환 때 정리하려고 따로 들고 있는다
    let unsubDoc: (() => void) | null = null;

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      unsubDoc?.();
      unsubDoc = null;

      if (firebaseUser && db) {
        const ref = doc(db, 'users', firebaseUser.uid);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          const newUser: UserDoc = {
            displayName: firebaseUser.displayName || '',
            photoURL: firebaseUser.photoURL || '',
            role: null,
            pendingRole: null,
            pendingSchoolId: null,
            schoolIds: [],
            classIds: [],
            children: [],
            pendingClassRequest: null,
            avatarId: null,
            avatarCustom: { hat: null, accessory: null },
            stamps: 0,
            preferences: { theme: 'light' },
            createdAt: serverTimestamp() as never,
          };
          await setDoc(ref, newUser);
        }
        // 한 번만 읽으면 서버가 준 도장·착용 아이템이 새로고침 전까지 안 보인다
        unsubDoc = onSnapshot(
          ref,
          (s) => {
            if (s.exists()) setRealDoc(s.data() as UserDoc);
            setLoading(false);
          },
          () => setLoading(false)
        );
      } else {
        setRealDoc(null);
        setViewAs(null);
        setLoading(false);
      }
    });

    return () => {
      unsubDoc?.();
      unsubscribe();
    };
  }, [setViewAs]);

  const actualRole = realDoc?.role ?? null;
  // 테스트 모드는 슈퍼 관리자만 쓸 수 있다
  const activeViewAs = actualRole === 'super_admin' ? viewAs : null;

  // 가장한 역할에 맞게 소속 정보까지 채워야 학생·학부모 화면이 제대로 나온다
  let effectiveDoc = realDoc;
  if (realDoc && activeViewAs) {
    if (activeViewAs.role === 'student') {
      effectiveDoc = { ...realDoc, role: 'student', classIds: [activeViewAs.classId] };
    } else if (activeViewAs.role === 'parent') {
      effectiveDoc = {
        ...realDoc,
        role: 'parent',
        children: [{ studentUid: 'test-child', classId: activeViewAs.classId, name: '테스트 자녀' }],
      };
    } else {
      effectiveDoc = { ...realDoc, role: activeViewAs.role };
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        userDoc: effectiveDoc,
        role: activeViewAs?.role ?? actualRole,
        actualRole,
        loading,
        viewAs: activeViewAs,
        setViewAs,
        signInWithGoogle: async () => {
          if (!auth) return;
          const provider = new GoogleAuthProvider();
          await signInWithPopup(auth, provider);
        },
        signOut: async () => {
          if (!auth) return;
          setViewAs(null);
          await firebaseSignOut(auth);
          setRealDoc(null);
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
