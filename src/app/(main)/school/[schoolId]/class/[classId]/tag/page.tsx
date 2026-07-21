'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useParams, useRouter } from 'next/navigation';
import { collection, onSnapshot } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { inventoryPath } from '@/lib/paths';
import { playSound } from '@/lib/sound';
import {
  watchTag, startTag, passTag, endTag, formatLeft,
  TAG_COOLDOWN_MS, type TagState,
} from '@/lib/tag-game';

const PlaygroundScene = dynamic(
  () => import('@/components/gallery3d/PlaygroundScene'),
  { ssr: false }
);

/**
 * 우리 반 술래잡기.
 *
 * 방은 반 단위다 — 3학년 1반 아이들끼리만 만난다.
 * 위치는 다중접속(presence)이 이미 나르고 있어서, 여기서는 '누가 술래인가' 만 다룬다.
 */
export default function TagPage() {
  const { user, userDoc } = useAuth();
  const router = useRouter();
  const params = useParams();
  const schoolId = params.schoolId as string;
  const classId = params.classId as string;
  const roomKey = `tag-${classId}`;

  const [state, setState] = useState<TagState>({
    status: 'waiting', it: null, endsAt: 0, scores: {},
  });
  const [left, setLeft] = useState(0);
  const [flash, setFlash] = useState('');

  /** 방금 잡혔거나 잡은 직후 — 이 동안은 판정하지 않는다 */
  const cooldownUntil = useRef(0);
  const prevIt = useRef<string | null>(null);

  /** 가진 놀이 아이템 개수 */
  const [items, setItems] = useState<Record<string, number>>({});
  /** 이 판에 신발을 썼나 */
  const [fast, setFast] = useState(false);
  /** 방패가 켜져 있나 — 잡히면 한 번 되돌려준다 */
  const [shield, setShield] = useState(false);
  const shieldRef = useRef(false);
  useEffect(() => { shieldRef.current = shield; }, [shield]);

  const me = user && userDoc ? {
    uid: user.uid,
    look: {
      name: userDoc.displayName || '친구',
      avatarId: userDoc.avatarId ?? null,
      shirt: userDoc.avatarTint?.shirt ?? null,
      hair: userDoc.avatarTint?.hair ?? null,
    },
  } : null;

  const iAmIt = !!me && state.it === me.uid;
  const playing = state.status === 'playing' && left > 0;

  useEffect(() => watchTag(schoolId, roomKey, setState), [schoolId, roomKey]);

  // 내 아이템 (상점에서 산 것)
  useEffect(() => {
    if (!db || !user) return;
    return onSnapshot(
      collection(db, inventoryPath(user.uid)),
      (snap) => {
        const m: Record<string, number> = {};
        snap.forEach((d) => {
          const c = (d.data().count as number) ?? 0;
          if (c > 0) m[d.id] = c;
        });
        setItems(m);
      },
      () => setItems({})
    );
  }, [user]);

  /** 아이템을 쓴다 — 개수는 서버가 깎는다 */
  const useItem = useCallback(async (itemId: string) => {
    const token = await auth?.currentUser?.getIdToken();
    const res = await fetch('/api/shop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: 'use', itemId }),
    });
    return res.ok;
  }, []);

  // 남은 시간
  useEffect(() => {
    const t = setInterval(() => setLeft(Math.max(0, state.endsAt - Date.now())), 250);
    return () => clearInterval(t);
  }, [state.endsAt]);

  /**
   * 술래가 바뀐 순간을 잡아 알려주고, 잠깐 판정을 쉰다.
   * 이게 없으면 잡히자마자 서로 붙어 있어서 술래가 핑퐁처럼 왔다갔다한다.
   */
  useEffect(() => {
    if (state.it === prevIt.current) return;
    const wasFirst = prevIt.current === null;
    const prev = prevIt.current;
    prevIt.current = state.it;
    cooldownUntil.current = Date.now() + TAG_COOLDOWN_MS;
    if (wasFirst || !me) return;

    if (state.it === me.uid) {
      /**
       * 방패는 '되돌려주기' 다.
       *
       * 잡힌 순간 나는 술래가 되고, **술래는 술래를 넘길 수 있다**(규칙).
       * 그래서 나를 잡은 사람에게 곧장 돌려준다 — 규칙을 우회하지 않고
       * 규칙 안에서 되는 방법이다. 남의 화면에 손대지도 않는다.
       */
      if (shieldRef.current) {
        const tagger = prev;
        setShield(false);
        if (tagger) {
          setFlash('🛡️ 방패로 막았다! 되돌려주기');
          playSound('success');
          passTag(schoolId, roomKey, tagger, me.uid, me.look.name, state.scores[me.uid]?.c ?? 0);
          cooldownUntil.current = Date.now() + TAG_COOLDOWN_MS;
          const tt = setTimeout(() => setFlash(''), 2200);
          return () => clearTimeout(tt);
        }
      }
      setFlash('잡혔다! 이제 내가 술래 👹');
      playSound('error');
    } else {
      const name = state.scores[state.it ?? '']?.n;
      setFlash(name ? `${name}(이)가 술래가 됐어요!` : '술래가 바뀌었어요!');
      playSound('success');
    }
    const t = setTimeout(() => setFlash(''), 2200);
    return () => clearTimeout(t);
  }, [state.it, me, state.scores]);

  const handleStart = useCallback(async () => {
    if (!me) return;
    await startTag(schoolId, roomKey, me.uid, me.look.name);
    setFlash('내가 술래! 친구들을 잡아보세요 👹');
    setTimeout(() => setFlash(''), 2200);
  }, [schoolId, roomKey, me]);

  const handleTag = useCallback((uid: string) => {
    if (!me || !playing) return;
    if (Date.now() < cooldownUntil.current) return;
    cooldownUntil.current = Date.now() + TAG_COOLDOWN_MS;
    const myCount = state.scores[me.uid]?.c ?? 0;
    passTag(schoolId, roomKey, uid, me.uid, me.look.name, myCount);
  }, [schoolId, roomKey, me, playing, state.scores]);

  // 판이 바뀌면 이번 판 효과는 사라진다. 한 번 쓴 게 계속 남으면 산 보람이 없다.
  useEffect(() => {
    if (state.status !== 'playing') { setFast(false); setShield(false); }
  }, [state.status]);

  // 시간이 다 되면 끝낸다 (술래가 끝낸다 — 아무나 끝내면 여러 번 쓰인다)
  useEffect(() => {
    if (state.status !== 'playing' || left > 0 || !iAmIt) return;
    endTag(schoolId, roomKey);
  }, [state.status, left, iAmIt, schoolId, roomKey]);

  const ranking = Object.entries(state.scores)
    .map(([uid, v]) => ({ uid, name: v.n, count: v.c }))
    .sort((a, b) => b.count - a.count);

  return (
    <div className="relative min-h-screen overflow-hidden">
      <PlaygroundScene
        schoolId={schoolId}
        roomKey={roomKey}
        me={me}
        itUid={state.it}
        playing={playing}
        speedBoost={fast}
        avatarId={userDoc?.avatarId}
        avatarCustom={userDoc?.avatarCustom}
        avatarTint={userDoc?.avatarTint}
        onTag={handleTag}
      />

      <button
        onClick={() => router.push(`/school/${schoolId}/class/${classId}/room`)}
        className="absolute left-4 top-4 z-30 rounded-full px-4 py-2.5 text-xs font-bold"
        style={{ background: '#FFF8E7', color: '#6B5B43', border: '3px solid #EFE3CB', boxShadow: '0 4px 0 #E3D5B8' }}
      >
        ← 교실로
      </button>

      {/* 남은 시간 */}
      {playing && (
        <div
          className="absolute right-4 top-4 z-30 rounded-2xl px-4 py-2.5 text-lg font-black tabular-nums"
          style={{ background: '#FFF8E7', color: iAmIt ? '#C0392B' : '#6B5B43', border: '3px solid #EFE3CB' }}
        >
          {iAmIt ? '👹 ' : '🏃 '}{formatLeft(left)}
        </div>
      )}

      {/* 순간 알림 */}
      {flash && (
        <div className="absolute inset-x-0 top-24 z-40 flex justify-center pointer-events-none px-4">
          <div
            className="rounded-2xl px-5 py-3 text-base font-black text-center"
            style={{ background: 'rgba(255,248,231,0.96)', color: '#6B5B43', boxShadow: '0 6px 18px rgba(0,0,0,0.25)' }}
          >
            {flash}
          </div>
        </div>
      )}

      {/* 하단 판 */}
      <div className="absolute inset-x-0 bottom-0 z-30 px-4 pb-6 pointer-events-none">
        <div
          className="mx-auto w-full max-w-[420px] rounded-[28px] p-5 pointer-events-auto"
          style={{ background: 'rgba(255,250,240,0.96)', border: '3px solid rgba(255,255,255,0.7)' }}
        >
          {!me && (
            <div className="text-[12px] text-center" style={{ color: '#8A7A5F' }}>
              로그인하면 친구들과 같이 놀 수 있어요
            </div>
          )}

          {me && !playing && (
            <>
              <div className="text-base font-black mb-1" style={{ color: '#3A3226' }}>
                {state.status === 'done' ? '🏁 끝났어요!' : '👹 우리 반 술래잡기'}
              </div>
              <div className="text-[11px] mb-3 leading-relaxed" style={{ color: '#8A7A5F' }}>
                시작을 누르면 <b>누른 사람이 술래</b>예요. 친구에게 닿으면 술래가 넘어가요.
                친구가 같이 들어와 있어야 재밌어요!
              </div>
              <button
                onClick={handleStart}
                className="w-full rounded-full py-3 text-sm font-bold text-white"
                style={{ background: 'var(--color-primary)' }}
              >
                {state.status === 'done' ? '한 판 더!' : '술래잡기 시작'}
              </button>
            </>
          )}

          {me && playing && (
            <>
              <div className="text-[12px] text-center font-bold mb-2" style={{ color: iAmIt ? '#C0392B' : '#2E6DA8' }}>
                {iAmIt ? '친구에게 닿으면 술래가 넘어가요!' : '술래에게 잡히지 마세요!'}
              </div>

              {/* 숙제로 모은 도장으로 산 것들 */}
              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    if (fast || !(items['play-shoes'] > 0)) return;
                    if (await useItem('play-shoes')) {
                      setFast(true);
                      setFlash('🥾 바람의 신발! 더 빨라졌어요');
                      setTimeout(() => setFlash(''), 1800);
                    }
                  }}
                  disabled={fast || !(items['play-shoes'] > 0)}
                  className="flex-1 rounded-2xl py-2.5 flex flex-col items-center gap-0.5 disabled:opacity-40"
                  style={{ background: fast ? '#EAF7EA' : 'white' }}
                >
                  <span className="text-xl">🥾</span>
                  <span className="text-[10px] font-bold" style={{ color: '#8A7A5F' }}>
                    {fast ? '달리는 중!' : `바람의 신발 ${items['play-shoes'] ?? 0}`}
                  </span>
                </button>

                <button
                  onClick={async () => {
                    if (shield || !(items['play-shield'] > 0)) return;
                    if (await useItem('play-shield')) {
                      setShield(true);
                      setFlash('🛡️ 방패를 들었어요');
                      setTimeout(() => setFlash(''), 1800);
                    }
                  }}
                  disabled={shield || !(items['play-shield'] > 0)}
                  className="flex-1 rounded-2xl py-2.5 flex flex-col items-center gap-0.5 disabled:opacity-40"
                  style={{ background: shield ? '#EAF2FB' : 'white' }}
                >
                  <span className="text-xl">🛡️</span>
                  <span className="text-[10px] font-bold" style={{ color: '#8A7A5F' }}>
                    {shield ? '방패 켜짐!' : `튼튼 방패 ${items['play-shield'] ?? 0}`}
                  </span>
                </button>
              </div>

              {!items['play-shoes'] && !items['play-shield'] && (
                <div className="text-[10px] text-center mt-2 leading-relaxed" style={{ color: '#A89880' }}>
                  숙제를 내고 도장을 모으면 상점에서 놀이 아이템을 살 수 있어요.
                  <b> 없어도 노는 데는 아무 지장 없어요.</b>
                </div>
              )}
            </>
          )}

          {ranking.length > 0 && (
            <div className="mt-3">
              <div className="text-[11px] font-bold mb-1.5" style={{ color: '#8A7A5F' }}>🏆 많이 잡은 친구</div>
              <div className="flex flex-col gap-1">
                {ranking.slice(0, 5).map((r, i) => (
                  <div
                    key={r.uid}
                    className="flex items-center gap-2 rounded-xl px-3 py-1.5 text-[12px]"
                    style={{ background: r.uid === me?.uid ? '#EAF7EA' : 'white', color: '#3A3226' }}
                  >
                    <span className="font-black w-5">{['🥇', '🥈', '🥉'][i] ?? i + 1}</span>
                    <span className="truncate">{r.name}</span>
                    <span className="ml-auto font-bold">{r.count}명</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
