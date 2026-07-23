'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { CAPACITY, overflowCount } from '@/lib/exhibit-layout';
import dynamic from 'next/dynamic';
import { collection, getDocs, doc, getDoc, query, where, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { ArtworkDoc, ActivityDoc, type ExhibitVisibility } from '@/lib/firestore-schema';
import { useAuth } from '@/lib/auth-context';
import ShareButton from '@/components/common/ShareButton';
import { canUploadArtwork, isTeacherOfClass, myClassIds } from '@/lib/auth-helpers';
import { visibilityOf } from '@/lib/exhibit-scope';
import ArtworkDetailModal from '@/components/artwork/ArtworkDetailModal';
import ArtworkUploadModal from '@/components/artwork/ArtworkUploadModal';

const ExhibitRoom = dynamic(() => import('@/components/gallery3d/Gallery3DView'), { ssr: false });
const MobileJoystick = dynamic(() => import('@/components/gallery3d/MobileJoystick'), { ssr: false });


interface ArtworkData {
  id: string;
  title: string;
  artistName: string;
  imageUrl: string;
  /** 액자용 작은 판 (옛 작품엔 없다) */
  thumbnailUrl?: string;
  type: 'flat' | 'sculpture';
  artistComment?: string;
  /** 영상 작품이면 유튜브 번호 */
  videoId?: string | null;
}

export default function ActivityExhibitPage() {
  const router = useRouter();
  const params = useParams();
  const schoolId = params.schoolId as string;
  const classId = params.classId as string;
  const activityId = params.activityId as string;
  const { role, userDoc } = useAuth();

  const [activity, setActivity] = useState<ActivityDoc | null>(null);
  const [artworks, setArtworks] = useState<ArtworkData[]>([]);
  const [fetched, setFetched] = useState(false);
  const [selectedArtwork, setSelectedArtwork] = useState<ArtworkData | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  /** 공개 범위 바꾸는 중 */
  const [visBusy, setVisBusy] = useState(false);
  const [visMsg, setVisMsg] = useState('');

  const basePath = `schools/${schoolId}/classes/${classId}/activities/${activityId}/artworks`;
  const myClass = isTeacherOfClass(role, userDoc?.classIds, classId);
  const visibility = visibilityOf(activity?.visibility);

  /**
   * 공개 범위 바꾸기 — **전시실만 고치면 안 된다.**
   *
   * 전체 갤러리는 작품을 `collectionGroup` 으로 긁으므로 전시실 문서를 못 본다.
   * 그래서 작품마다 베껴둔 `visibility` 를 함께 고쳐야 하고, 안 그러면
   * "전시실은 우리 반만인데 갤러리에는 그대로 걸려 있는" 상태가 된다.
   * 한 전시실의 작품은 많아야 수십 개라 배치 한 번이면 된다.
   */
  const changeVisibility = useCallback(async (next: ExhibitVisibility) => {
    if (!db || visBusy) return;
    setVisBusy(true); setVisMsg('');
    try {
      const snap = await getDocs(collection(db, basePath));
      const batch = writeBatch(db);
      batch.update(doc(db, 'schools', schoolId, 'classes', classId, 'activities', activityId), {
        visibility: next,
      });
      snap.docs.forEach((d) => batch.update(d.ref, { visibility: next }));
      await batch.commit();
      setActivity((a) => (a ? { ...a, visibility: next } : a));
      setVisMsg(next === 'class'
        ? `우리 반만 보도록 바꿨어요 (작품 ${snap.size}점도 함께)`
        : `학교 전체가 보도록 바꿨어요 (작품 ${snap.size}점도 함께)`);
    } catch {
      // 거부는 조용히 온다. finally 가 없으면 버튼이 잠긴 채로 남는다.
      setVisMsg('바꾸지 못했어요. 우리 반이 맞는지 확인해 주세요.');
    } finally {
      setVisBusy(false);
    }
  }, [basePath, schoolId, classId, activityId, visBusy]);

  /**
   * **질의를 규칙에 맞춰 고른다.**
   *
   * 규칙은 '학교 공개' 이거나 '이 반 사람' 인 작품만 열어준다. 반 사람이 아닌데
   * 조건 없이 물으면 (잠긴 작품이 하나라도 있을 때) **질의 전체가 거부되어
   * 전시실이 통째로 안 열린다.** 그래서 반 밖에서는 `visibility` 를 걸어서 묻는다.
   * 반 사람인지는 규칙과 같은 기준(`classIds` + 학부모의 `childClassIds`)으로 본다.
   */
  const amInClass = myClass || myClassIds(userDoc).includes(classId);

  const fetchArtworks = useCallback(async () => {
    if (!db) return;
    try {
      const artSnap = await getDocs(
        amInClass
          ? query(collection(db, basePath), where('status', '==', 'approved'))
          : query(
              collection(db, basePath),
              where('status', '==', 'approved'),
              where('visibility', '==', 'school')
            )
      );
      const list = artSnap.docs
        .map((d) => {
          const data = d.data() as ArtworkDoc;
          return {
            id: d.id,
            title: data.title,
            artistName: data.artistName,
            imageUrl: data.imageUrl,
            // 원본과 같은 주소면 썸네일이 없는 옛 작품이다
            thumbnailUrl:
              data.thumbnailUrl && data.thumbnailUrl !== data.imageUrl ? data.thumbnailUrl : undefined,
            type: data.type,
            artistComment: data.artistComment,
            videoId: data.videoId ?? null,
          };
        });
      setArtworks(list);
    } catch (e) {
      console.error('Failed to fetch artworks:', e);
    }
    setFetched(true);
  }, [basePath, amInClass]);

  useEffect(() => {
    async function fetchData() {
      if (!db) return;
      const actRef = doc(db, 'schools', schoolId, 'classes', classId, 'activities', activityId);
      const actSnap = await getDoc(actRef);
      if (actSnap.exists()) {
        setActivity(actSnap.data() as ActivityDoc);
      }
      fetchArtworks();
    }
    fetchData();
  }, [classId, activityId, fetchArtworks]);

  return (
    <div className="relative w-full h-dvh">
      {/* 3D 전시실 */}
      <ExhibitRoom
        artworks={artworks}
        onArtworkClick={(artwork) => setSelectedArtwork(artwork as ArtworkData)}
        onExit={() => router.push(`/school/${schoolId}/class/${classId}/room`)}
        avatarId={userDoc?.avatarId}
        avatarCustom={userDoc?.avatarCustom}
        avatarTint={userDoc?.avatarTint}
      />

      {/* 상단 HUD — 한 줄 플렉스 (겹침 방지) */}
      <div className="absolute top-4 left-4 right-4 z-30 flex items-center gap-2">
        <button
          onClick={() => router.push(`/school/${schoolId}/class/${classId}/room`)}
          className="ac-btn shrink-0 px-3.5 py-2 text-sm"
        >
          ← 교실로
        </button>
        <div className="ac-bubble hidden sm:block px-4 py-2 text-sm truncate">
          🖼️ {activity?.title || activityId}
        </div>
        <div className="ml-auto shrink-0">
          <ShareButton title={`🖼️ ${activity?.title || '작품 전시실'}`} text="아이들 작품을 3D 전시실에서 구경해보세요" />
        </div>
        {canUploadArtwork(role) && (
          <button
            onClick={() => setShowUpload(true)}
            className="ac-btn ac-btn-green shrink-0 px-3.5 py-2 text-sm"
          >
            + 작품 올리기
          </button>
        )}
      </div>

      {/*
        공개 범위 — **담임에게만.** 아이가 바꾸면 반 전체 전시가 사라진다.
        '우리 반만' 일 때는 보는 사람 모두에게 자물쇠를 보여준다 —
        아이도 "이건 우리끼리만 보는 것" 을 알아야 마음 놓고 건다.
      */}
      {(myClass || visibility === 'class') && (
        <div className="absolute left-4 z-30 pos-top-safe" style={{ top: 'calc(env(safe-area-inset-top, 0px) + 4.25rem)' }}>
          {myClass ? (
            <button
              onClick={() => changeVisibility(visibility === 'class' ? 'school' : 'class')}
              disabled={visBusy}
              className="ac-btn px-3.5 py-2 text-[13px] disabled:opacity-50"
            >
              {visBusy
                ? '바꾸는 중...'
                : visibility === 'class' ? '🔒 우리 반만 — 눌러서 공개' : '🏫 학교 전체 — 눌러서 잠그기'}
            </button>
          ) : (
            <div className="ac-bubble px-3.5 py-2 text-[13px]">🔒 우리 반만 보는 전시예요</div>
          )}
          {visMsg && (
            <div className="ac-bubble mt-1.5 px-3.5 py-2 text-[12px] max-w-[260px] leading-relaxed">
              {visMsg}
            </div>
          )}
        </div>
      )}

      {/* 빈 전시실 안내 */}
      {fetched && artworks.length === 0 && !selectedArtwork && !showUpload && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 px-4 w-full max-w-[380px] pointer-events-none">
          <div className="ac-bubble px-5 py-4 text-center text-[13px] leading-relaxed">
            {/*
              **잠긴 전시실은 '빈 방' 이 아니다.** 규칙이 작품을 안 내려주므로
              화면에는 똑같이 비어 보이는데, 그대로 두면 아이는 선생님이 아직
              안 걸었다고 생각한다. 왜 안 보이는지를 말해줘야 한다.
            */}
            {visibility === 'class' && !amInClass ? (
              <>
                🔒 우리 반만 보는 전시예요<br />
                이 반 친구와 선생님, 그리고 가족만 볼 수 있어요.
              </>
            ) : (
              <>
                🖼️ 아직 전시된 작품이 없어요<br />
                {canUploadArtwork(role)
                  ? '오른쪽 위 [+ 작품 올리기]로 첫 작품을 걸어보세요!'
                  : '작품이 승인되면 이 벽에 걸립니다'}
              </>
            )}
          </div>
        </div>
      )}

      {/* 모바일 조이스틱 */}
      {!selectedArtwork && !showUpload && <MobileJoystick />}

      {/* 조작 안내 */}
      {!selectedArtwork && !showUpload && (
        <div className="absolute bottom-6 right-4 z-30 sm:left-1/2 sm:-translate-x-1/2 sm:right-auto">
          <div className="ac-bubble px-4 py-2.5 text-[12px] leading-relaxed">
            <span className="hidden sm:inline">🚶 WASD 이동 · 🖱️ 드래그로 상하좌우 시점 · 휠 줌 · ❗ 뜨면 작품 클릭!</span>
            <span className="sm:hidden">🕹️ 조이스틱 이동 · 드래그로 시점 · 두 손가락 줌</span>
          </div>
        </div>
      )}

      {/*
        벽이 모자라 못 건 작품이 있으면 **말해준다.**
        조용히 빼면 그 아이는 자기 작품이 왜 없는지 알 수 없다.
        선생님에게 '전시를 나누라' 는 다음 할 일까지 알려준다.
      */}
      {overflowCount(artworks.length) > 0 && (
        <div className="pos-hint absolute left-4 right-4 z-30 mx-auto max-w-[420px]">
          <div
            className="rounded-2xl px-4 py-3 text-[13px] font-bold leading-relaxed"
            style={{ background: 'rgba(253,236,234,0.96)', color: '#B02A37' }}
          >
            ⚠️ 벽이 모자라서 {overflowCount(artworks.length)}점이 아직 안 걸렸어요.
            전시실 하나에는 {CAPACITY}점까지 걸려요 — 전시를 하나 더 만들어 나눠 걸어주세요.
          </div>
        </div>
      )}

      {/* 작품 상세 모달 */}
      {selectedArtwork && (
        <ArtworkDetailModal
          artwork={selectedArtwork}
          collectionPath={basePath}
          onClose={() => setSelectedArtwork(null)}
        />
      )}

      {/* 작품 업로드 모달 */}
      {showUpload && (
        <ArtworkUploadModal
          collectionPath={basePath}
          onClose={() => setShowUpload(false)}
          onUploaded={fetchArtworks}
        />
      )}
    </div>
  );
}
