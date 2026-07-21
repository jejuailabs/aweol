'use client';

import { getDatabase, ref, onValue, set, remove, onDisconnect, serverTimestamp } from 'firebase/database';
import { app } from './firebase';

/**
 * 달리기 대기실.
 *
 * 혼자 뛰면 그냥 기록 재기지만, **같이 출발하면 경기가 된다.**
 * 준비를 누른 사람들이 출발선에 나란히 서고, 카운트다운이 끝나면 동시에 뛴다.
 *
 * 여기서 다루는 건 '누가 준비했나' 와 '언제 출발하나' 뿐이다.
 * 위치는 다중접속(presence)이, 기록은 서버(/api/track)가 이미 맡고 있다.
 * **기록 재기는 그대로 서버가 한다** — 같이 출발한다고 시간까지 화면에 맡기면
 * 애써 만든 부정 방지가 무너진다.
 */

/** 준비 누르고 이만큼 지나면 자동으로 풀린다 (창을 닫고 간 사람 정리) */
const READY_TTL_MS = 120000;
/** 출발 신호를 보내고 실제로 뛰기까지 */
export const COUNTDOWN_MS = 3200;

export interface RacePlayer {
  uid: string;
  name: string;
}

export interface LobbyState {
  players: RacePlayer[];
  /** 다 같이 출발하는 시각. 0이면 아직 안 정해짐 */
  startAt: number;
}

function base(schoolId: string) {
  return `games/${schoolId}/race`;
}

/** 대기실을 구독한다 */
export function watchLobby(
  schoolId: string,
  onState: (s: LobbyState) => void
): () => void {
  if (!app) return () => {};
  const db = getDatabase(app);
  return onValue(ref(db, base(schoolId)), (snap) => {
    const v = snap.val() as
      | { ready?: Record<string, { n?: string; t?: number }>; state?: { endsAt?: number } }
      | null;
    const now = Date.now();
    const players: RacePlayer[] = [];
    Object.entries(v?.ready ?? {}).forEach(([uid, r]) => {
      // 오래된 준비는 무시한다. 창을 닫고 간 사람이 계속 서 있으면 안 된다.
      if (typeof r?.t === 'number' && now - r.t > READY_TTL_MS) return;
      players.push({ uid, name: r?.n || '친구' });
    });
    onState({ players, startAt: v?.state?.endsAt ?? 0 });
  });
}

/** 준비 (출발선에 선다) */
export async function setReady(schoolId: string, uid: string, name: string, ready: boolean) {
  if (!app) return;
  const db = getDatabase(app);
  const meRef = ref(db, `${base(schoolId)}/ready/${uid}`);
  if (!ready) { await remove(meRef).catch(() => {}); return; }
  await set(meRef, { n: name.slice(0, 20), t: serverTimestamp() }).catch(() => {});
  // 창을 닫으면 출발선에서 사라진다
  onDisconnect(meRef).remove().catch(() => {});
}

/**
 * 출발 신호.
 *
 * **모두가 같은 시각을 보고 세도록 시각 하나만 적는다.**
 * 각자 자기 화면에서 3,2,1 을 세면 누구는 먼저 뛴다.
 */
export async function callStart(schoolId: string) {
  if (!app) return;
  const db = getDatabase(app);
  await set(ref(db, `${base(schoolId)}/state`), {
    status: 'playing',
    endsAt: Date.now() + COUNTDOWN_MS,
    startedBy: '',
  }).catch(() => {});
}

/** 출발 신호를 지운다 (판이 끝나면) */
export async function clearStart(schoolId: string) {
  if (!app) return;
  const db = getDatabase(app);
  await set(ref(db, `${base(schoolId)}/state`), {
    status: 'done', endsAt: 0, startedBy: '',
  }).catch(() => {});
}
