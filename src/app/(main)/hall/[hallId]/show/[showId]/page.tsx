'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useParams, useRouter } from 'next/navigation';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { hallPath, type HallDoc, type ShowDoc, type WorkDoc } from '@/lib/art-hall';
import ShareButton from '@/components/common/ShareButton';
import { backdropClose } from '@/lib/backdrop';
import WorkComments, { useShowComments } from '@/components/gallery3d/WorkComments';
import { usePicks } from '@/lib/picks';

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
  const { user, userDoc, role } = useAuth();
  const uid = user?.uid;

  /** 같은 전시실에 온 사람들에게 알릴 '나' — 로그인해야 서로 보인다 */
  const me = user && userDoc ? {
    uid: user.uid,
    look: {
      name: userDoc.displayName || '친구',
      avatarId: userDoc.avatarId ?? null,
      shirt: userDoc.avatarTint?.shirt ?? null,
      hair: userDoc.avatarTint?.hair ?? null,
    },
  } : null;

  const [hall, setHall] = useState<HallDoc | null>(null);
  const [show, setShow] = useState<(ShowDoc & { id: string }) | null>(null);
  const [works, setWorks] = useState<(WorkDoc & { id: string })[]>([]);
  const [tried, setTried] = useState(false);
  /** 크게 보는 중인 작품 */
  const [open, setOpen] = useState<(WorkDoc & { id: string }) | null>(null);
  /** 말을 보고 있는 작품 */
  const [talking, setTalking] = useState<(WorkDoc & { id: string }) | null>(null);

  /** 이 전시에 달린 말 — 한 번에 받아 작품마다 나눠 붙인다 */
  const talk = useShowComments(hallId, showId);
  const isOwner = !!uid && hall?.ownerUid === uid;
  /** 내가 찜한 그림 — 하트를 채울지 정하고, 누르면 담거나 뺀다 */
  const picks = usePicks(uid);

  useEffect(() => {
    if (!db || !hallId || !showId) { setTried(true); return; }
    // 아이는 규칙이 막는다 — 굳이 물어서 실패를 쌓지 않는다
    if (role === 'student') { setShow(null); setTried(true); return; }
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

        /**
         * **보는 사람에 맞춰 질의를 고른다.** (전시관 화면과 같은 이유)
         * 규칙이 `isPublic` 이나 `ownerUid` 를 보는데 질의에 그 조건이 없으면
         * Firestore 가 목록 질의를 통째로 거부한다 — 주인만 못 보게 된다.
         */
        const mine = !!uid && (hs.data() as HallDoc | undefined)?.ownerUid === uid;
        const snap = await getDocs(
          mine
            ? query(
                collection(db!, 'halls', hallId, 'shows', showId, 'works'),
                where('ownerUid', '==', uid)
              )
            : query(
                collection(db!, 'halls', hallId, 'shows', showId, 'works'),
                where('isPublic', '==', true)
              )
        );
        if (!alive) return;
        setWorks(
          snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as WorkDoc) }))
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        );
      } catch {
        if (alive) setShow(null);
      } finally {
        if (alive) setTried(true);
      }
    })();
    return () => { alive = false; };
  }, [hallId, showId, role, uid]);

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
        hallId={hallId}
        me={me}
        works={works}
        theme={hall?.theme ?? 'white'}
        hallTitle={hall?.title ?? ''}
        avatarId={userDoc?.avatarId}
        avatarCustom={userDoc?.avatarCustom}
        avatarTint={userDoc?.avatarTint}
        onSelect={setOpen}
        onExit={() => router.push(hallPath(hallId))}
        talks={talk.talks}
        onTalk={(w) => { setTalking(w); talk.markSeen(); }}
      >
        {/*
          퍼가기 — **전시실은 전시관보다 더 보내고 싶은 자리다.**
          "우리 전시관 와봐" 보다 "이 전시 봐봐" 가 구체적이라, 받은 사람이
          바로 그 방으로 들어온다. 공개된 전시만 띄운다 — 감춘 것을 퍼가면
          받은 사람은 못 연다.
        */}
        {show.isPublic && (
          <div className="pos-top-safe absolute right-4 z-30">
            <ShareButton
              title={show.title}
              text={hall?.title ? `${hall.title} — ${show.title}` : show.title}
            />
          </div>
        )}

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
          {...backdropClose(() => setOpen(null))}
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
              <div className="shrink-0 flex flex-col gap-2">
                {/*
                  찜 — **크게 본 자리에서 담는다.**

                  마음에 드는 그림은 크게 봤을 때 정해진다. 벽에서 작게 볼 때는
                  담을지 말지가 안 정해지고, 방을 나간 뒤에는 이미 늦다.

                  로그인해야 담을 수 있으므로, 아니면 아예 안 보여준다 —
                  눌렀는데 아무 일도 안 일어나는 단추가 제일 나쁘다.
                */}
                {uid && (
                  <button
                    onClick={() => picks.toggle({
                      hallId,
                      showId,
                      workId: open.id,
                      // 목록은 작게 보여주므로 벽에 걸린 작은 판을 먼저 쓴다
                      imageUrl: open.thumbnailUrl || open.imageUrl,
                      title: open.title || '무제',
                      hallTitle: hall?.title ?? '',
                      showTitle: show.title ?? '',
                    })}
                    className="rounded-full px-4 py-2 text-[14px] font-bold whitespace-nowrap transition-transform active:scale-95"
                    style={
                      picks.has(hallId, showId, open.id)
                        ? { background: '#E8604C', color: '#FFF5F2' }
                        : { background: 'rgba(255,255,255,0.14)', color: '#FBFAF8' }
                    }
                  >
                    {picks.has(hallId, showId, open.id) ? '♥ 찜함' : '♡ 찜하기'}
                  </button>
                )}
                {/* 크게 보다가 바로 한마디 — 다시 벽으로 나갈 이유가 없다 */}
                <button
                  onClick={() => { setTalking(open); setOpen(null); talk.markSeen(); }}
                  className="rounded-full px-4 py-2 text-[14px] font-bold whitespace-nowrap"
                  style={{ background: 'rgba(255,255,255,0.14)', color: '#FBFAF8' }}
                >
                  💬 {talk.forWork(open.id).length > 0 ? talk.forWork(open.id).length : '한마디'}
                </button>
                <button
                  onClick={() => setOpen(null)}
                  className="rounded-full px-4 py-2 text-[14px] font-bold"
                  style={{ background: 'rgba(255,255,255,0.14)', color: '#FBFAF8' }}
                >
                  닫기
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 작품에 남긴 말 */}
      {talking && (
        <WorkComments
          hallId={hallId}
          showId={showId}
          work={talking}
          isOwner={isOwner}
          rows={talk.forWork(talking.id)}
          onClose={() => setTalking(null)}
          onChanged={talk.reload}
        />
      )}
    </div>
  );
}
