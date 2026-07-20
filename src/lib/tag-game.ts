'use client';

import { getDatabase, ref, onValue, set, update, get } from 'firebase/database';
import { app } from './firebase';

/**
 * 술래잡기.
 *
 * 위치는 이미 presence 가 나르고 있다(초당 5번). 여기서는 **누가 술래인가**와
 * **언제 끝나는가**만 다룬다 — 이 둘은 잡을 때만 바뀌므로 요금이 거의 안 붙는다.
 *
 * **누가 잡혔는지는 술래의 화면이 판단한다.**
 * 서버가 판정하려면 모든 아이의 좌표를 서버가 다시 계산해야 하는데, 그건 지금 구조에
 * 없는 서버를 하나 더 두는 일이다. 반 친구끼리 이름 붙이고 하는 놀이고, 속여봐야
 * '네가 술래' 가 전부라 여기서는 이 정도가 맞다고 봤다.
 * 다만 규칙에서 **술래만 술래를 넘길 수 있게** 막아뒀다 — 아무나 남을 술래로
 * 만들어버리는 건 놀이가 안 된다.
 */

/** 이 거리 안이면 잡은 것 */
export const TAG_DIST = 1.1;
/** 잡히고 나서 이만큼은 못 잡는다 (바로 되잡기 방지) */
export const TAG_COOLDOWN_MS = 3000;
/** 한 판 길이 */
export const ROUND_MS = 3 * 60 * 1000;

export type TagStatus = 'waiting' | 'playing' | 'done';

export interface TagState {
  status: TagStatus;
  it: string | null;
  endsAt: number;
  scores: Record<string, { n: string; c: number }>;
}

const EMPTY: TagState = { status: 'waiting', it: null, endsAt: 0, scores: {} };

function gameRef(schoolId: string, roomKey: string) {
  const db = getDatabase(app!);
  return ref(db, `games/${schoolId}/${roomKey}`);
}

/** 판 상태를 구독한다 */
export function watchTag(
  schoolId: string,
  roomKey: string,
  onState: (s: TagState) => void
): () => void {
  if (!app) return () => {};
  return onValue(gameRef(schoolId, roomKey), (snap) => {
    const v = snap.val() as
      | { it?: string; state?: { status?: TagStatus; endsAt?: number }; scores?: TagState['scores'] }
      | null;
    if (!v) { onState(EMPTY); return; }
    onState({
      status: v.state?.status ?? 'waiting',
      it: v.it ?? null,
      endsAt: v.state?.endsAt ?? 0,
      scores: v.scores ?? {},
    });
  });
}

/**
 * 판을 연다.
 *
 * 시작한 사람이 첫 술래다. 아무도 술래가 아닌 상태(`it` 없음)에서만
 * 술래를 집을 수 있게 규칙이 막고 있어서, 판이 도는 중에 끼어들 수 없다.
 */
export async function startTag(schoolId: string, roomKey: string, uid: string, name: string) {
  if (!app) return;
  const g = gameRef(schoolId, roomKey);
  const cur = await get(g);
  const st = cur.val() as { state?: { status?: TagStatus } } | null;
  if (st?.state?.status === 'playing') return;   // 이미 하는 중이면 그대로 둔다

  const db = getDatabase(app);
  // 지난 판 흔적을 지우고 새로 깐다
  await set(ref(db, `games/${schoolId}/${roomKey}/state`), {
    status: 'playing',
    endsAt: Date.now() + ROUND_MS,
    startedBy: uid,
  });
  await set(ref(db, `games/${schoolId}/${roomKey}/it`), uid).catch(() => {});
  await update(ref(db, `games/${schoolId}/${roomKey}/scores/${uid}`), {
    n: name.slice(0, 20),
    c: 0,
  }).catch(() => {});
}

/** 술래를 넘긴다 (규칙상 지금 술래만 된다) */
export async function passTag(
  schoolId: string,
  roomKey: string,
  targetUid: string,
  myUid: string,
  myName: string,
  myCount: number
) {
  if (!app) return;
  const db = getDatabase(app);
  await set(ref(db, `games/${schoolId}/${roomKey}/it`), targetUid);
  // 내가 몇 명 잡았는지
  await update(ref(db, `games/${schoolId}/${roomKey}/scores/${myUid}`), {
    n: myName.slice(0, 20),
    c: Math.min(999, myCount + 1),
  }).catch(() => {});
}

/** 판을 끝낸다 */
export async function endTag(schoolId: string, roomKey: string) {
  if (!app) return;
  const db = getDatabase(app);
  await set(ref(db, `games/${schoolId}/${roomKey}/state`), {
    status: 'done',
    endsAt: Date.now(),
    startedBy: '',
  });
}

/** 남은 시간을 사람이 읽는 모양으로 */
export function formatLeft(ms: number): string {
  const t = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}
