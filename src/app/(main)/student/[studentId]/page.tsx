'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { collectionGroup, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { ArtworkDoc } from '@/lib/firestore-schema';
import { useAuth } from '@/lib/auth-context';
import { scopeFromPath } from '@/lib/exhibit-scope';
import ShareButton from '@/components/common/ShareButton';
import ArtworkDetailModal from '@/components/artwork/ArtworkDetailModal';

const ExhibitRoom = dynamic(() => import('@/components/gallery3d/Gallery3DView'), { ssr: false });
const MobileJoystick = dynamic(() => import('@/components/gallery3d/MobileJoystick'), { ssr: false });

interface ArtworkData {
  id: string;
  path: string;
  title: string;
  artistName: string;
  imageUrl: string;
  thumbnailUrl?: string;
  type: 'flat' | 'sculpture';
  artistComment?: string;
  videoId?: string | null;
  /** 몇 학년 때 것인지 — 이 전시실의 핵심이다 */
  classId: string;
}

/**
 * **한 아이의 전시실.**
 *
 * 지금까지 작품은 늘 *반*에 매여 있었다. 그래서 3학년 그림과 6학년 그림이 서로 다른
 * 방에 흩어져 있고, 반이 기억창고로 들어가면 더 찾기 어려워진다.
 * 졸업할 때 아이에게 남는 것은 '3학년 2반 전시실' 이 아니라 **자기가 만든 것들**이다.
 *
 * 그래서 여기는 반을 가로질러 모은다 — 1학년 것부터 6학년 것까지 한 방에.
 * 새 자료를 만들지 않는다. 이미 있는 작품을 **작가로 묶어** 보여줄 뿐이다.
 */
export default function StudentExhibitPage() {
  const router = useRouter();
  const studentId = useParams().studentId as string;
  const { user, userDoc } = useAuth();

  const [artworks, setArtworks] = useState<ArtworkData[]>([]);
  const [fetched, setFetched] = useState(false);
  const [selected, setSelected] = useState<ArtworkData | null>(null);
  /** 학년 고르기 — 6년치가 한 방에 다 걸리면 벽이 모자란다 */
  const [grade, setGrade] = useState('');

  const isMe = !!user && user.uid === studentId;

  useEffect(() => {
    async function fetchMine() {
      if (!db) return;
      try {
        /**
         * **질의를 규칙에 맞춰 고른다.**
         *
         * 본인은 규칙이 자기 작품을 전부 열어준다(`artistUid == request.auth.uid`).
         * 남이 볼 때는 '승인 + 학교 공개' 만 열리므로 그 조건을 걸어야 한다 —
         * 안 걸면 잠긴 작품 하나 때문에 **질의 전체가 거부되어 전시실이 통째로 빈다.**
         */
        const q = isMe
          ? query(collectionGroup(db, 'artworks'), where('artistUid', '==', studentId))
          : query(
              collectionGroup(db, 'artworks'),
              where('artistUid', '==', studentId),
              where('status', '==', 'approved'),
              where('visibility', '==', 'school')
            );
        const snap = await getDocs(q);
        const list = snap.docs
          .map((d) => {
            const v = d.data() as ArtworkDoc;
            return {
              id: d.id,
              path: d.ref.path,
              title: v.title,
              artistName: v.artistName,
              imageUrl: v.imageUrl,
              thumbnailUrl:
                v.thumbnailUrl && v.thumbnailUrl !== v.imageUrl ? v.thumbnailUrl : undefined,
              type: v.type,
              artistComment: v.artistComment,
              videoId: v.videoId ?? null,
              classId: v.classId || scopeFromPath(d.ref.path).classId,
            };
          })
;
        setArtworks(list);
      } catch (e) {
        console.error('Failed to fetch student artworks:', e);
      }
      setFetched(true);
    }
    fetchMine();
  }, [studentId, isMe]);

  /** 몇 학년 때 것들이 있나 — 반 번호('3-1')의 앞자리가 학년이다 */
  const grades = [...new Set(artworks.map((a) => a.classId.split('-')[0]).filter(Boolean))].sort();
  const shown = grade ? artworks.filter((a) => a.classId.startsWith(`${grade}-`)) : artworks;

  const artistName = artworks[0]?.artistName || (isMe ? userDoc?.displayName : '') || '친구';

  return (
    <div className="scene-page">
      <ExhibitRoom
        artworks={shown}
        onArtworkClick={(artwork) => setSelected(artwork as ArtworkData)}
        onExit={() => router.push('/')}
        avatarId={userDoc?.avatarId}
        avatarCustom={userDoc?.avatarCustom}
        avatarTint={userDoc?.avatarTint}
      />

      <div className="absolute top-4 left-4 right-4 z-30 flex items-center gap-2">
        <button onClick={() => router.back()} className="ac-btn shrink-0 px-3.5 py-2 text-sm">
          ← 돌아가기
        </button>
        <div className="ac-bubble hidden sm:block px-4 py-2 text-sm truncate">
          🎒 {artistName}의 전시실 · {shown.length}점
        </div>
        <div className="ml-auto shrink-0">
          <ShareButton
            title={`🎒 ${artistName}의 전시실`}
            text="지금까지 만든 작품을 한 방에 모았어요"
          />
        </div>
      </div>

      {/*
        학년 고르기 — 6년치가 한 번에 걸리면 벽이 모자라고, 아이도 "3학년 때 그거"
        를 찾고 싶어한다. 작품이 있는 학년만 만든다.
      */}
      {grades.length > 1 && (
        <div
          className="absolute left-4 z-30 flex flex-wrap gap-1.5"
          style={{ top: 'calc(env(safe-area-inset-top, 0px) + 4.25rem)' }}
        >
          <button
            onClick={() => setGrade('')}
            className="ac-btn px-3 py-1.5 text-[13px]"
            style={!grade ? { background: 'var(--color-primary)', color: 'white' } : undefined}
          >
            전부
          </button>
          {grades.map((g) => (
            <button
              key={g}
              onClick={() => setGrade(g)}
              className="ac-btn px-3 py-1.5 text-[13px]"
              style={grade === g ? { background: 'var(--color-primary)', color: 'white' } : undefined}
            >
              {g}학년
            </button>
          ))}
        </div>
      )}

      {fetched && artworks.length === 0 && !selected && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 px-4 w-full max-w-[380px] pointer-events-none">
          <div className="ac-bubble px-5 py-4 text-center text-[13px] leading-relaxed">
            🎒 아직 걸린 작품이 없어요<br />
            {isMe
              ? '전시실에 작품을 올리면 여기에도 모여요.'
              : '학교 전체가 볼 수 있는 작품만 여기 걸려요.'}
          </div>
        </div>
      )}

      {!selected && <MobileJoystick />}

      {selected && (
        <ArtworkDetailModal
          artwork={{
            id: selected.id,
            title: selected.title,
            artistName: selected.artistName,
            imageUrl: selected.imageUrl,
            type: selected.type,
            artistComment: selected.artistComment,
            videoId: selected.videoId ?? null,
          }}
          collectionPath={selected.path.split('/').slice(0, -1).join('/')}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
