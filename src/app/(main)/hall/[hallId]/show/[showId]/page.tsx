'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useParams, useRouter } from 'next/navigation';
import { collection, doc, getDoc, getDocs, orderBy, query } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { hallPath, type HallDoc, type ShowDoc, type WorkDoc } from '@/lib/art-hall';

const ArtShowScene = dynamic(() => import('@/components/gallery3d/ArtShowScene'), { ssr: false });
const MobileJoystick = dynamic(() => import('@/components/gallery3d/MobileJoystick'), { ssr: false });

/**
 * 전시실 안 — 걸어다니며 작품을 본다.
 *
 * 작품을 누르면 크게 본다. **크게 보는 창은 3D 밖(DOM)** 이다 —
 * 3D 안에 띄우면 벽에 가리고, 휴대폰에서는 글씨가 안 읽힌다.
 */
export default function ShowPage() {
  const router = useRouter();
  const params = useParams();
  const hallId = String(params.hallId ?? '');
  const showId = String(params.showId ?? '');
  const { userDoc } = useAuth();

  const [hall, setHall] = useState<HallDoc | null>(null);
  const [show, setShow] = useState<(ShowDoc & { id: string }) | null>(null);
  const [works, setWorks] = useState<(WorkDoc & { id: string })[]>([]);
  const [tried, setTried] = useState(false);
  /** 크게 보는 중인 작품 */
  const [open, setOpen] = useState<(WorkDoc & { id: string }) | null>(null);

  useEffect(() => {
    if (!db || !hallId || !showId) { setTried(true); return; }
    let alive = true;
    (async () => {
      try {
        const [hs, ss] = await Promise.all([
          getDoc(doc(db!, 'halls', hallId)),
          getDoc(doc(db!, 'halls', hallId, 'shows', showId)),
        ]);
        if (!alive) return;
        if (hs.exists()) setHall(hs.data() as HallDoc);
        if (!ss.exists()) { setShow(null); return; }
        setShow({ id: ss.id, ...(ss.data() as ShowDoc) });

        const q = query(
          collection(db!, 'halls', hallId, 'shows', showId, 'works'),
          orderBy('order', 'asc')
        );
        const snap = await getDocs(q);
        if (!alive) return;
        setWorks(snap.docs.map((d) => ({ id: d.id, ...(d.data() as WorkDoc) })));
      } catch {
        if (alive) setShow(null);
      } finally {
        if (alive) setTried(true);
      }
    })();
    return () => { alive = false; };
  }, [hallId, showId]);

  if (!tried) {
    return (
      <div className="scene-page">
        <div className="absolute inset-0 flex items-center justify-center" style={{ background: '#EDEBE7' }}>
          <div className="text-sm font-bold" style={{ color: '#5B4A3B' }}>전시실을 여는 중...</div>
        </div>
      </div>
    );
  }

  if (!show) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
        <span className="text-5xl">🖼️</span>
        <p className="text-sm" style={{ color: 'var(--color-text-sub)' }}>
          찾을 수 없는 전시예요
        </p>
        <button
          onClick={() => router.push(hallPath(hallId))}
          className="rounded-full px-6 py-2.5 text-sm font-bold text-white"
          style={{ background: 'var(--color-primary)' }}
        >
          미술관 앞으로
        </button>
      </div>
    );
  }

  return (
    <div className="scene-page">
      <ArtShowScene
        show={show}
        works={works}
        theme={hall?.theme ?? 'white'}
        hallTitle={hall?.title ?? ''}
        avatarId={userDoc?.avatarId}
        avatarCustom={userDoc?.avatarCustom}
        avatarTint={userDoc?.avatarTint}
        onSelect={setOpen}
        onExit={() => router.push(hallPath(hallId))}
      >
        {works.length === 0 && (
          <div className="pos-hint absolute left-1/2 -translate-x-1/2 z-20 w-[min(92vw,420px)]">
            <div
              className="rounded-2xl px-5 py-4 text-center"
              style={{ background: 'rgba(255,250,240,0.96)', color: '#5B4A3B' }}
            >
              <div className="text-[15px] font-black mb-1">아직 걸린 작품이 없어요</div>
              <div className="text-[13px]">곧 채워질 예정이에요.</div>
            </div>
          </div>
        )}
      </ArtShowScene>

      <MobileJoystick />

      {/* 작품 크게 보기 */}
      {open && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center px-4 py-6"
          style={{ background: 'rgba(16,14,12,0.88)' }}
          onClick={() => setOpen(null)}
        >
          <div
            className="w-full max-w-[860px] max-h-full flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={open.imageUrl}
              alt={open.title || ''}
              className="w-full min-h-0 flex-1 object-contain rounded-xl"
              style={{ background: '#1A1816' }}
            />
            <div className="mt-3 flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-[17px] font-black" style={{ color: '#FBFAF8' }}>
                  {open.title || '무제'}
                </div>
                {open.takenAt && (
                  <div className="text-[12px] mt-0.5" style={{ color: 'rgba(255,255,255,0.6)' }}>
                    {open.takenAt}
                  </div>
                )}
                {open.caption && (
                  <div
                    className="text-[13px] leading-relaxed mt-2 whitespace-pre-line"
                    style={{ color: 'rgba(255,255,255,0.82)' }}
                  >
                    {open.caption}
                  </div>
                )}
              </div>
              <button
                onClick={() => setOpen(null)}
                className="shrink-0 rounded-full px-4 py-2 text-[14px] font-bold"
                style={{ background: 'rgba(255,255,255,0.14)', color: '#FBFAF8' }}
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
