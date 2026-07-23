'use client';

import { useCallback, useEffect, useState } from 'react';
import { collection, doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { useAuth } from './auth-context';

/**
 * 조사 기록 — **한 곳에서 읽고 한 곳에서 적는다.**
 *
 * 기관 화면, 유적 화면, 조사 수첩이 모두 같은 기록을 본다.
 * 화면마다 따로 읽으면 어느 하나가 뒤처져서, 다녀왔는데도 심부름이
 * 안 끝난 것처럼 보인다.
 *
 * 열쇠는 세 가지다(`village-rpg.ts` 참고):
 * - `site-{siteId}` · `place-{kind}` · `quest-{questId}`
 *
 * **`onSnapshot` 으로 지켜본다.** 유적 화면에서 조사를 마치고 마을로 돌아오면
 * 그 사이에 기록이 바뀌어 있어야 한다 — 한 번 읽고 마는 방식이면
 * 새로고침해야 느낌표가 바뀐다.
 *
 * **로그인 안 한 아이도 논다.** 다만 남지 않는다 — 놀이를 막을 이유는 없다.
 */
export function useProgress() {
  const { user } = useAuth();
  /**
   * 서버에서 받은 기록. **로그인 안 했으면 `null`** 이다 —
   * 그때는 빈 집합을 새로 만들지 않고 아래 `EMPTY` 를 그대로 쓴다.
   * (효과 안에서 상태를 곧바로 바꾸면 그릴 때마다 다시 그리게 된다)
   */
  const [got, setGot] = useState<ReadonlySet<string> | null>(null);
  const done = got ?? EMPTY;

  useEffect(() => {
    if (!db || !user) return;
    return onSnapshot(
      collection(db, 'users', user.uid, 'quests'),
      (snap) => {
        const s = new Set<string>();
        for (const d of snap.docs) if (d.data()?.done === true) s.add(d.id);
        setGot(s);
      },
      () => setGot(new Set())
    );
  }, [user]);

  /**
   * 하나 적는다.
   *
   * 못 적어도 화면은 그대로 진행된다 — **기록 때문에 놀이가 막히면 안 된다.**
   */
  const mark = useCallback((key: string, extra: Record<string, unknown> = {}) => {
    // 서버가 알려주기 전에 화면부터 바뀌어야 한다 — 눌렀는데 아무 일이 없으면 또 누른다
    setGot((prev) => {
      const base = prev ?? EMPTY;
      return base.has(key) ? prev : new Set(base).add(key);
    });
    if (!db || !user) return;
    setDoc(
      doc(db, 'users', user.uid, 'quests', key),
      { done: true, at: serverTimestamp(), ...extra },
      { merge: true }
    ).catch(() => {});
  }, [user]);

  return { done, mark, signedIn: !!user };
}

/** 로그인 전에는 이걸 그대로 쓴다 — 그릴 때마다 새 집합을 만들면 안 된다 */
const EMPTY: ReadonlySet<string> = new Set();
