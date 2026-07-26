'use client';

import { useCallback, useEffect, useState } from 'react';
import { arrayUnion, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { useAuth } from './auth-context';

/**
 * 정화한 것 기록.
 *
 * 줍기(`use-collection.ts`)와 **같은 얼개**다 — 문서 하나에 모으고,
 * 화면부터 바꾼 뒤 서버에 적는다. 못 적어도 놀이는 그대로 간다.
 *
 * 표를 따로 두는 이유: 줍기와 정화는 **다 채웠을 때 주는 상이 따로**다.
 * 한 문서에 섞으면 "소라 여덟 개" 와 "쓰레기 열두 마리" 를 갈라 세느라
 * 읽을 때마다 걸러야 하고, 상을 두 번 주는 실수가 나기 쉽다.
 */

const EMPTY: ReadonlySet<string> = new Set();

export function usePurify() {
  const { user } = useAuth();
  const [cleared, setCleared] = useState<ReadonlySet<string> | null>(null);
  /** 자리를 다 치워 상을 이미 받은 곳 */
  const [rewarded, setRewarded] = useState<ReadonlySet<string> | null>(null);

  useEffect(() => {
    if (!db || !user) return;
    return onSnapshot(
      doc(db, 'users', user.uid, 'purify', 'village'),
      (snap) => {
        const v = snap.data() ?? {};
        setCleared(new Set<string>((v.cleared as string[]) ?? []));
        setRewarded(new Set<string>((v.rewarded as string[]) ?? []));
      },
      () => { setCleared(new Set()); setRewarded(new Set()); }
    );
  }, [user]);

  /**
   * 하나 정화했다.
   *
   * `arrayUnion` 이라 같은 것을 두 번 적어도 한 번만 쌓인다.
   */
  const clear = useCallback((mobId: string) => {
    setCleared((prev) => {
      const base = prev ?? EMPTY;
      return base.has(mobId) ? prev : new Set(base).add(mobId);
    });
    if (!db || !user) return;
    setDoc(
      doc(db, 'users', user.uid, 'purify', 'village'),
      { cleared: arrayUnion(mobId) },
      { merge: true }
    ).catch(() => {});
  }, [user]);

  return {
    cleared: cleared ?? EMPTY,
    rewarded: rewarded ?? EMPTY,
    clear,
    signedIn: !!user,
  };
}
