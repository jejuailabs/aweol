'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useParams, useRouter } from 'next/navigation';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { showPath, type HallDoc, type ShowDoc } from '@/lib/art-hall';

const ArtHallScene = dynamic(() => import('@/components/gallery3d/ArtHallScene'), { ssr: false });
/** 걸어다니는 3D 화면에는 빠짐없이 있어야 한다 — 없으면 휴대폰에서 못 움직인다 */
const MobileJoystick = dynamic(() => import('@/components/gallery3d/MobileJoystick'), { ssr: false });

/**
 * 개인 전시관 앞 — 미술관 광장.
 *
 * 배너를 눌러 전시실로 들어간다. **감춰 둔 전시관은 주인만 볼 수 있다** —
 * 규칙(firestore.rules)이 막으므로 화면은 못 읽은 것을 그대로 '없음' 으로 다룬다.
 */
export default function HallPage() {
  const router = useRouter();
  const hallId = String(useParams().hallId ?? '');
  const { user, userDoc, role } = useAuth();

  const [hall, setHall] = useState<(HallDoc & { id: string }) | null>(null);
  const [shows, setShows] = useState<(ShowDoc & { id: string })[]>([]);
  const [tried, setTried] = useState(false);

  useEffect(() => {
    if (!db || !hallId) { setTried(true); return; }
    // 아이는 규칙이 막는다 — 굳이 물어서 실패를 쌓지 않는다
    if (role === 'student') { setHall(null); setTried(true); return; }
    let alive = true;
    (async () => {
      try {
        const s = await getDoc(doc(db!, 'halls', hallId));
        if (!alive) return;
        if (!s.exists()) { setHall(null); return; }
        const hv = s.data() as HallDoc;
        setHall({ id: s.id, ...hv });

        /**
         * **보는 사람에 맞춰 질의를 고른다.**
         *
         * 규칙이 `isPublic == true` 이거나 `ownerUid == 나` 일 때 열어주는데,
         * 질의에 그 조건이 없으면 Firestore 가 목록 질의를 통째로 거부한다
         * (규칙은 거르개가 아니다). 조건 없이 물었더니 **주인만 못 보는**
         * 일이 벌어졌다 — 총관리자는 `isSuper()` 로 통과했기 때문에
         * 한동안 아무도 못 알아챘다.
         *
         * 차례는 받아 와서 정렬한다 — 질의에 `orderBy` 를 얹으면 복합 색인이
         * 따로 필요한데 전시는 많아야 여섯 개다.
         */
        const mine = !!user && hv.ownerUid === user.uid;
        const snap = await getDocs(
          mine
            ? query(collection(db!, 'halls', hallId, 'shows'), where('ownerUid', '==', user.uid))
            : query(collection(db!, 'halls', hallId, 'shows'), where('isPublic', '==', true))
        );
        if (!alive) return;
        setShows(
          snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as ShowDoc) }))
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        );
      } catch {
        // 감춘 전시관을 남이 열면 규칙이 막는다 — 그냥 '없음' 으로 둔다
        if (alive) setHall(null);
      } finally {
        if (alive) setTried(true);
      }
    })();
    return () => { alive = false; };
  }, [hallId, role, user]);

  const isOwner = !!user && hall?.ownerUid === user.uid;

  if (!tried) {
    return (
      <div className="scene-page">
        <div className="absolute inset-0 flex items-center justify-center" style={{ background: '#CFDEE8' }}>
          <div className="text-sm font-bold" style={{ color: '#5B4A3B' }}>전시관을 여는 중...</div>
        </div>
      </div>
    );
  }

  if (!hall) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
        <span className="text-5xl">🖼️</span>
        <p className="text-sm" style={{ color: 'var(--color-text-sub)' }}>
          아직 열리지 않은 전시관이에요
        </p>
        <button
          onClick={() => router.push('/')}
          className="rounded-full px-6 py-2.5 text-sm font-bold text-white"
          style={{ background: 'var(--color-primary)' }}
        >
          지도로 돌아가기
        </button>
      </div>
    );
  }

  return (
    <div className="scene-page">
      <ArtHallScene
        hall={hall}
        shows={shows}
        avatarId={userDoc?.avatarId}
        avatarCustom={userDoc?.avatarCustom}
        avatarTint={userDoc?.avatarTint}
        onEnterShow={(showId) => router.push(showPath(hallId, showId))}
        onExit={() => router.push('/')}
      >
        {/* 주인에게만 — 고치러 가는 길 */}
        {isOwner && (
          <button
            onClick={() => router.push('/my-hall')}
            className="pos-top-safe absolute right-4 z-30 rounded-full px-4 py-2.5 text-sm font-bold"
            style={{ background: '#FFF8E7', color: '#6B5B43', border: '3px solid #EFE3CB', boxShadow: '0 4px 0 #E3D5B8' }}
          >
            ✏️ 내 전시관 관리
          </button>
        )}

        {/*
          아직 아무 전시도 안 걸렸을 때.

          **누가 무엇을 해야 하는지까지 말해준다.** 전에는 남에게 "곧 열릴
          예정이에요" 한 줄만 띄웠는데, 총관리자가 관리 화면에서 눌러 들어오면
          그 한 줄이 막다른 길이었다 — 고치러 갈 곳도, 누구에게 말해야 할지도
          알 수 없었다. 전시를 거는 것은 **주인만** 할 수 있는 일이므로
          주인이 누구인지 알려주는 것이 답이다.
        */}
        {shows.length === 0 && (
          <div className="pos-hint absolute left-1/2 -translate-x-1/2 z-20 w-[min(92vw,440px)]">
            <div
              className="rounded-2xl px-5 py-4 text-center"
              style={{ background: 'rgba(255,250,240,0.96)', color: '#5B4A3B' }}
            >
              <div className="text-[15px] font-black mb-1">아직 걸린 전시가 없어요</div>
              <div className="text-[13px] leading-relaxed">
                {isOwner ? (
                  <>오른쪽 위 <b>✏️ 내 전시관 관리</b>에서 첫 전시를 열어보세요.</>
                ) : (
                  <>
                    <b>{hall.ownerName || '주인'}</b> 님의 전시관이에요.
                    <br />
                    전시를 거는 것은 주인만 할 수 있어요 —
                    주인이 로그인해서 <b>프로필 → 🖼️ 내 전시관</b>에서 열면 돼요.
                  </>
                )}
              </div>
              {isOwner && (
                <button
                  onClick={() => router.push('/my-hall')}
                  className="mt-3 rounded-full px-5 py-2.5 text-[14px] font-bold text-white"
                  style={{ background: 'var(--color-primary)' }}
                >
                  첫 전시 만들러 가기
                </button>
              )}
            </div>
          </div>
        )}

        {/* 관장의 말 — 있을 때만, 광장 한쪽에 */}
        {hall.tagline && shows.length > 0 && (
          <div className="pos-hint absolute left-1/2 -translate-x-1/2 z-20 w-[min(92vw,440px)] pointer-events-none">
            <div
              className="rounded-2xl px-4 py-2.5 text-center text-[13px] font-bold"
              style={{ background: 'rgba(255,255,255,0.86)', color: '#4A453E' }}
            >
              {hall.tagline}
            </div>
          </div>
        )}
      </ArtHallScene>

      <MobileJoystick />
    </div>
  );
}
