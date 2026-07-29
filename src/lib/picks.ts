'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  collection, deleteDoc, doc, getDocs, orderBy, query, serverTimestamp, setDoc,
} from 'firebase/firestore';
import { db } from './firebase';
import { playSound } from './sound';

/**
 * 찜 — **마음에 든 그림을 내 쪽에 담아 둔다.**
 *
 * 전시관은 여기저기 흩어져 있고, 한 번 나오면 그 그림을 다시 찾아가기가
 * 어렵다. 어느 전시관 어느 전시였는지를 기억해야 하는데, 관람하는 사람이
 * 그걸 외우고 다니지는 않는다.
 *
 * ---
 *
 * **'좋아요' 가 아니다.** 좋아요는 작품에 붙는 점수라 남에게 보이고, 수를
 * 세야 하고, 조작을 막아야 한다. 찜은 **나만 보는 책갈피**다. 남의 눈에
 * 띄지 않으니 경쟁이 되지 않고, 아이가 '내 그림이 몇 개 받았나' 로
 * 속상해질 일도 없다.
 *
 * ---
 *
 * **그림 정보를 베껴 둔다.**
 *
 * 찜 목록을 열 때마다 원본 작품 문서를 읽으면, 찜이 마흔 개면 읽기가
 * 마흔 번이다. 게다가 그 작품들은 **서로 다른 전시관**에 흩어져 있어서
 * 한 번에 묶어 읽을 수도 없다. 그래서 제목·그림 주소를 찜 문서에 함께
 * 적어 둔다 — **목록 화면은 질의 한 번**으로 끝난다.
 *
 * 대신 원본이 바뀌면 여기가 낡는다. 제목을 고쳐도 찜 목록에는 옛 제목이
 * 남는다. **그 정도는 받아들인다** — 눌러서 들어가면 진짜가 나오고,
 * 지워진 작품이면 그때 알려주면 된다. 읽기 마흔 번을 아끼는 값이다.
 */

export interface PickDoc {
  hallId: string;
  showId: string;
  workId: string;
  /** 벽에 걸린 작은 판(없으면 원본). 목록은 작게 보여주므로 이걸 먼저 쓴다. */
  imageUrl: string;
  title: string;
  /** 어디서 찜했는지 — 목록에서 "아, 그 전시" 하고 떠올릴 실마리 */
  hallTitle: string;
  showTitle: string;
  createdAt: unknown;
}

export type PickRow = PickDoc & { id: string };

/**
 * 찜 문서의 id.
 *
 * **무작위 id 를 쓰면 안 된다.** 그러면 같은 그림을 두 번 찜할 수 있고,
 * 찜을 풀려면 먼저 찾아서 지워야 한다. 셋을 이어 붙이면 **같은 그림은
 * 언제나 같은 문서**라, 찜은 덮어쓰기이고 해제는 지우기다.
 *
 * 문서 id 에는 `/` 가 들어갈 수 없다. 세 값 모두 Firestore 가 만든
 * id 라 `/` 가 없지만, 혹시 모르니 걸러 둔다.
 */
export function pickId(hallId: string, showId: string, workId: string): string {
  const safe = (s: string) => s.replace(/[/]/g, '_');
  return `${safe(hallId)}__${safe(showId)}__${safe(workId)}`;
}

/** 목록·제목 길이 상한 — 규칙에서도 같은 값으로 막는다 */
export const MAX_PICK_TEXT = 120;

/**
 * 내 찜.
 *
 * @param uid 로그인한 사람. 없으면 아무것도 안 한다(비로그인은 찜을 못 한다).
 */
export function usePicks(uid: string | undefined) {
  const [rows, setRows] = useState<PickRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!db || !uid) { setRows([]); setLoaded(true); return; }
    try {
      const snap = await getDocs(
        query(collection(db, 'users', uid, 'picks'), orderBy('createdAt', 'desc'))
      );
      setRows(snap.docs.map((d) => ({ id: d.id, ...(d.data() as PickDoc) })));
    } catch {
      // 못 읽어도 화면은 뜬다 — 찜이 없는 것처럼 보일 뿐이다
      setRows([]);
    }
    setLoaded(true);
  }, [uid]);

  useEffect(() => { load(); }, [load]);

  /** 이 그림을 찜했나 */
  const has = useCallback(
    (hallId: string, showId: string, workId: string) =>
      rows.some((r) => r.id === pickId(hallId, showId, workId)),
    [rows]
  );

  /**
   * 찜하기 / 풀기 — **누른 즉시 바뀐다.**
   *
   * 서버 응답을 기다렸다 바꾸면 하트가 반 박자 늦게 채워져서, 안 눌린 줄 알고
   * 한 번 더 누른다(그러면 도로 풀린다). 그래서 화면을 먼저 바꾸고,
   * 실패하면 되돌린다.
   */
  const toggle = useCallback(
    async (input: Omit<PickDoc, 'createdAt'>) => {
      if (!db || !uid) return;
      const id = pickId(input.hallId, input.showId, input.workId);
      const ref = doc(db, 'users', uid, 'picks', id);
      const was = rows.some((r) => r.id === id);
      const clip = (s: string) => (s || '').slice(0, MAX_PICK_TEXT);

      const next: PickRow = {
        id,
        ...input,
        title: clip(input.title),
        hallTitle: clip(input.hallTitle),
        showTitle: clip(input.showTitle),
        createdAt: null,
      };
      setRows((prev) => (was ? prev.filter((r) => r.id !== id) : [next, ...prev]));
      playSound(was ? 'tap' : 'like');

      try {
        if (was) await deleteDoc(ref);
        else {
          const { id: _drop, ...body } = next;
          await setDoc(ref, { ...body, createdAt: serverTimestamp() });
        }
      } catch {
        // 되돌린다 — 화면에는 찜했는데 실제로는 안 담긴 상태가 제일 나쁘다
        setRows((prev) => (was ? [next, ...prev] : prev.filter((r) => r.id !== id)));
      }
    },
    [uid, rows]
  );

  /** 목록 화면에서 카드를 지울 때 */
  const remove = useCallback(
    async (id: string) => {
      if (!db || !uid) return;
      const gone = rows.find((r) => r.id === id);
      setRows((prev) => prev.filter((r) => r.id !== id));
      playSound('tap');
      try {
        await deleteDoc(doc(db, 'users', uid, 'picks', id));
      } catch {
        if (gone) setRows((prev) => [gone, ...prev]);
      }
    },
    [uid, rows]
  );

  return { rows, loaded, has, toggle, remove, reload: load };
}
