'use client';

import { useCallback, useEffect, useState } from 'react';
import { arrayUnion, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { useAuth } from './auth-context';

/**
 * 주운 것 기록.
 *
 * **문서 하나에 모아 둔다.** 물건마다 문서를 만들면 마을에 들어설 때마다
 * 물건 수만큼 읽는다 — 자리 셋에 여덟 개면 스물넷이다. 하루 5만 읽기를
 * 아이 수로 나눠 쓰는 처지에 그럴 이유가 없다.
 *
 * 조사 기록(`use-progress.ts`)과 같은 얼개다 — 화면부터 바꾸고 서버에 적는다.
 * 못 적어도 놀이는 그대로 간다.
 */

const EMPTY: ReadonlySet<string> = new Set();

export function useCollection() {
  const { user } = useAuth();
  const [picked, setPicked] = useState<ReadonlySet<string> | null>(null);
  /** 자리를 다 채워 상을 이미 받은 곳 */
  const [rewarded, setRewarded] = useState<ReadonlySet<string> | null>(null);

  useEffect(() => {
    if (!db || !user) return;
    return onSnapshot(
      doc(db, 'users', user.uid, 'collect', 'village'),
      (snap) => {
        const v = snap.data() ?? {};
        setPicked(new Set<string>((v.picked as string[]) ?? []));
        setRewarded(new Set<string>((v.rewarded as string[]) ?? []));
      },
      () => { setPicked(new Set()); setRewarded(new Set()); }
    );
  }, [user]);

  /**
   * 하나 주웠다.
   *
   * `arrayUnion` 이라 같은 것을 두 번 주워도 한 번만 쌓인다 —
   * 걸어다니다 같은 자리를 스쳐도 기록이 부풀지 않는다.
   */
  const pick = useCallback((itemId: string) => {
    setPicked((prev) => {
      const base = prev ?? EMPTY;
      return base.has(itemId) ? prev : new Set(base).add(itemId);
    });
    if (!db || !user) return;
    setDoc(
      doc(db, 'users', user.uid, 'collect', 'village'),
      { picked: arrayUnion(itemId) },
      { merge: true }
    ).catch(() => {});
  }, [user]);

  return {
    picked: picked ?? EMPTY,
    rewarded: rewarded ?? EMPTY,
    pick,
    signedIn: !!user,
  };
}
