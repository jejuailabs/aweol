'use client';

import {
  getDatabase, ref, onValue, set, update, remove, onDisconnect, serverTimestamp,
} from 'firebase/database';
import { app } from './firebase';

/**
 * 같은 공간에 있는 친구들 보여주기.
 *
 * **Firestore 를 쓰면 안 된다.** 25명이 40분 수업 내내 움직이면 문서 쓰기가
 * 수십만 번이라 한 번에 $10 쯤 나온다. 위치는 1초 뒤면 의미가 없어지는 값이라
 * 문서로 남길 이유도 없다. 그래서 **영속 데이터는 Firestore, 휘발성 위치는 RTDB** 로 나눈다.
 *
 * 요금은 세 가지로 잡는다:
 * 1. **초당 5번만 보낸다.** 60fps 로 보내면 12배가 된다. 5Hz 면 눈에 안 띈다.
 * 2. **움직일 때만 보낸다.** 아이들은 대부분 서서 구경한다. 가만히 있으면 안 보낸다.
 * 3. **좌표를 짧게 만든다.** 소수 둘째 자리까지 자른 문자열 하나로 보낸다.
 *    ({x,y,z,ry} 객체로 보내면 키 이름까지 매번 실려 3배 넘게 커진다)
 *
 * 이름·아바타(`m`)는 **들어올 때 한 번만** 쓰고, 그 뒤로는 위치(`p`)와 시각(`t`)만
 * 갱신한다. 매 틱에 이름까지 실으면 89바이트, 위치만이면 40바이트다 —
 * **2.2배 차이**고, 무료 한도(10GB/월) 기준으로 수업 67회와 149회의 차이가 된다(실측).
 *
 * 끊겼다 붙으면 `onDisconnect` 가 내 자리를 이미 지운 뒤라서, 위치만 갱신하면
 * 이름 없는 유령이 된다. 그래서 `.info/connected` 를 보고 **다시 붙을 때
 * 전체를 새로 쓴다.**
 *
 * **숨소식은 화면 그리기와 따로 돈다.** 예전에는 `useFrame` 에서만 보냈는데,
 * 탭이 뒤로 가거나 화면이 안 보이면 `requestAnimationFrame` 이 멈춰서 숨소식도
 * 같이 멈췄다. 그러면 멀쩡히 접속해 있는 사람이 남의 화면에서 사라졌다가
 * 탭을 다시 보면 나타난다 — 실제로 '깜빡였다 사라진다' 는 증상이 이것이었다.
 * 그래서 타이머로 따로 돌린다.
 */

/** 초당 보내는 횟수 */
const SEND_HZ = 5;
const SEND_INTERVAL = 1000 / SEND_HZ;

/** 이만큼도 안 움직였으면 안 보낸다 (미터) */
const MOVE_EPSILON = 0.05;
/** 이만큼도 안 돌았으면 안 보낸다 (라디안) */
const TURN_EPSILON = 0.08;

/**
 * 이 시간 넘게 소식 없는 사람은 화면에서 지운다.
 * onDisconnect 가 있지만 끊김을 못 잡는 경우(비행기 모드, 탭 강제 종료)가 있다.
 *
 * **넉넉해야 한다.** 짧게 잡으면 가만히 서 있는 사람이 숨소식 사이에 사라진다.
 */
const STALE_MS = 45000;

/**
 * 숨소식 주기. 가만히 있어도 이만큼마다 한 번은 보낸다.
 * STALE_MS 보다 충분히 짧아야 '살아 있는데 사라지는' 일이 없다.
 */
const HEARTBEAT_MS = 8000;

export interface PeerLook {
  name: string;
  avatarId: string | null;
  shirt: string | null;
  hair: string | null;
}

export interface Peer extends PeerLook {
  uid: string;
  x: number;
  z: number;
  ry: number;
}

/** 좌표를 문자열 하나로 — 소수 둘째 자리면 1cm 단위라 충분하다 */
function pack(x: number, z: number, ry: number): string {
  return `${x.toFixed(2)},${z.toFixed(2)},${ry.toFixed(2)}`;
}

function unpack(s: unknown): { x: number; z: number; ry: number } | null {
  if (typeof s !== 'string') return null;
  const parts = s.split(',');
  if (parts.length !== 3) return null;
  const [x, z, ry] = parts.map(Number);
  if (![x, z, ry].every(Number.isFinite)) return null;
  return { x, z, ry };
}

export interface PresenceHandle {
  /** 내 위치를 알린다. 자주 불러도 된다 — 안에서 알아서 솎아낸다. */
  push(x: number, z: number, ry: number): void;
  /** 방에서 나간다 */
  leave(): void;
}

/**
 * 방에 들어가서 내 위치를 알리고, 남들 위치를 받는다.
 *
 * `roomKey` 는 공간 하나를 가리킨다 — 'school', 'class-3-1', 'lobby' 처럼.
 * 다른 공간에 있는 사람은 애초에 받지 않는다(경로가 다르다). 받아놓고 거르면
 * 안 볼 사람 몫까지 내려받는 셈이다.
 */
export function joinRoom(
  schoolId: string,
  roomKey: string,
  uid: string,
  look: PeerLook,
  onPeers: (peers: Peer[]) => void
): PresenceHandle {
  if (!app) return { push: () => {}, leave: () => {} };

  const db = getDatabase(app);

  /**
   * **내 시계와 서버 시계의 차이.**
   *
   * `t` 는 서버가 찍은 시각인데 비교는 내 컴퓨터 시각으로 한다.
   * 컴퓨터 시계가 몇십 초만 어긋나 있어도 멀쩡히 있는 친구가 '오래된 소식' 으로
   * 걸러져 **깜빡이며 사라진다.** 실제로 그 증상이 나왔다.
   * RTDB 가 `.info/serverTimeOffset` 으로 차이를 알려주므로 그걸 더해서 본다.
   */
  let clockOffset = 0;
  const unsubOffset = onValue(ref(db, '.info/serverTimeOffset'), (snap) => {
    const v = snap.val();
    if (typeof v === 'number') clockOffset = v;
  });
  const serverNow = () => Date.now() + clockOffset;

  let lastSent = 0;
  let lastX = 0;
  let lastZ = 0;
  let lastRy = 0;
  const roomRef = ref(db, `rooms/${schoolId}/${roomKey}`);
  const meRef = ref(db, `rooms/${schoolId}/${roomKey}/${uid}`);

  const meta = () => ({
    n: look.name.slice(0, 20),
    a: look.avatarId ?? '',
    s: look.shirt ?? '',
    h: look.hair ?? '',
  });

  /** 내 자리를 통째로 새로 쓴다 (처음 들어올 때와 다시 붙었을 때) */
  const claim = (x = 0, z = 0, ry = 0) => {
    set(meRef, { p: pack(x, z, ry), t: serverTimestamp(), m: meta() }).catch(() => {});
    // 창을 닫거나 끊기면 서버가 알아서 지운다
    onDisconnect(meRef).remove().catch(() => {});
  };

  claim();

  /**
   * 다시 붙었을 때 자리를 되찾는다.
   * 이게 없으면 잠깐 끊긴 아이가 남들 화면에서 사라진 채로 돌아오지 못한다
   * (onDisconnect 가 지웠는데 그 뒤로는 위치만 갱신하니 이름이 없다).
   */
  const connRef = ref(db, '.info/connected');
  let wasConnected = false;
  const unsubConn = onValue(connRef, (snap) => {
    const now = snap.val() === true;
    if (now && !wasConnected) claim(lastX || 0, lastZ || 0, lastRy || 0);
    wasConnected = now;
  });

  /**
   * 숨소식 타이머 — 화면이 안 그려져도 '나 여기 있다' 는 계속 보낸다.
   * 위치는 마지막으로 알려진 값을 그대로 다시 쓴다.
   */
  const beat = setInterval(() => {
    if (Date.now() - lastSent < HEARTBEAT_MS) return;
    lastSent = Date.now();
    update(meRef, { p: pack(lastX, lastZ, lastRy), t: serverTimestamp() }).catch(() => {});
  }, HEARTBEAT_MS);

  const unsub = onValue(roomRef, (snap) => {
    const now = serverNow();
    const out: Peer[] = [];
    snap.forEach((child) => {
      const id = child.key;
      if (!id || id === uid) return;   // 나는 이미 화면에 있다
      const v = child.val() as { p?: unknown; t?: number; m?: Record<string, string> };
      const pos = unpack(v?.p);
      if (!pos) return;
      // 끊김을 못 잡은 유령은 안 그린다
      if (typeof v.t === 'number' && now - v.t > STALE_MS) return;
      out.push({
        uid: id,
        ...pos,
        name: v.m?.n || '친구',
        avatarId: v.m?.a || null,
        shirt: v.m?.s || null,
        hair: v.m?.h || null,
      });
    });
    onPeers(out);
  });

  return {
    push(x, z, ry) {
      const now = Date.now();
      if (now - lastSent < SEND_INTERVAL) return;

      const moved =
        Math.abs(x - lastX) > MOVE_EPSILON ||
        Math.abs(z - lastZ) > MOVE_EPSILON ||
        Math.abs(ry - lastRy) > TURN_EPSILON;
      /**
       * 가만히 있으면 안 보낸다 — '살아 있다' 는 위 타이머가 따로 알린다.
       * 여기서까지 숨소식을 챙기면 화면이 멈출 때 같이 멈춘다.
       */
      if (!moved) {
        // 움직이지 않아도 마지막 자리는 기억해둔다 (타이머가 이 값을 쓴다)
        lastX = x; lastZ = z; lastRy = ry;
        return;
      }

      lastSent = now;
      lastX = x; lastZ = z; lastRy = ry;
      // 위치와 시각만. 이름·아바타는 들어올 때 이미 썼다.
      update(meRef, { p: pack(x, z, ry), t: serverTimestamp() }).catch(() => {});
    },
    leave() {
      clearInterval(beat);
      unsub();
      unsubConn();
      unsubOffset();
      remove(meRef).catch(() => {});
    },
  };
}
