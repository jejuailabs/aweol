'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { collection, collectionGroup, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { ArtworkDoc } from '@/lib/firestore-schema';
import ArtworkDetailModal from '@/components/artwork/ArtworkDetailModal';

type ArtworkItem = ArtworkDoc & { id: string; path: string };

/**
 * 작품이 **어디에 걸려 있는지**.
 *
 * 경로에 이미 다 들어 있다 —
 * `schools/{schoolId}/classes/{classId}/activities/{activityId}/artworks/{id}`.
 * 그래서 학교·반·활동을 알아내는 데 **읽기가 한 번도 안 든다.**
 * (활동 '이름' 만 따로 필요한데, 그것도 아래에서 쿼리 한 번으로 전부 가져온다)
 */
function whereItHangs(path: string) {
  const p = path.split('/');
  return {
    schoolId: p[1] ?? '',
    classId: p[3] ?? '',
    activityId: p[5] ?? '',
  };
}

export default function GalleryPage() {
  const router = useRouter();
  const [artworks, setArtworks] = useState<ArtworkItem[]>([]);
  /** 활동 id → 활동 이름. 쿼리 한 번으로 통째로 받는다(작품마다 읽지 않는다). */
  const [actNames, setActNames] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<'all' | 'flat' | 'sculpture'>('all');
  const [fetched, setFetched] = useState(false);
  const [selected, setSelected] = useState<ArtworkItem | null>(null);

  useEffect(() => {
    async function fetchAll() {
      if (!db) return;
      try {
        const snap = await getDocs(
          query(collectionGroup(db, 'artworks'), where('status', '==', 'approved'))
        );
        const list = snap.docs.map((d) => ({ id: d.id, path: d.ref.path, ...d.data() } as ArtworkItem));
        setArtworks(list);
      } catch (e) {
        // collection-group 인덱스가 아직 없으면 반→활동→작품 순회로 폴백
        console.warn('collectionGroup 쿼리 실패, 순회 방식으로 폴백:', e);
        try {
          const list: ArtworkItem[] = [];
          const classSnap = await getDocs(collection(db, 'schools', 'aewol-elementary', 'classes'));
          for (const cls of classSnap.docs) {
            const actSnap = await getDocs(
              collection(db, 'schools', 'aewol-elementary', 'classes', cls.id, 'activities')
            );
            for (const act of actSnap.docs) {
              const artSnap = await getDocs(
                query(
                  collection(db, 'schools', 'aewol-elementary', 'classes', cls.id, 'activities', act.id, 'artworks'),
                  where('status', '==', 'approved')
                )
              );
              artSnap.docs.forEach((d) => {
                list.push({ id: d.id, path: d.ref.path, ...d.data() } as ArtworkItem);
              });
            }
          }
          setArtworks(list);
        } catch (e2) {
          console.error('Failed to fetch gallery:', e2);
        }
      }
      setFetched(true);
    }
    fetchAll();
  }, []);

  /**
   * 활동 이름을 한 번에 받아온다.
   *
   * 작품마다 활동 문서를 읽으면 작품 수만큼 읽기가 든다(수백 건).
   * 활동은 반마다 몇 개뿐이라 통째로 받는 게 훨씬 싸다.
   * 실패해도 화면은 그대로 뜬다 — 활동 이름만 안 보인다.
   */
  useEffect(() => {
    if (!db) return;
    getDocs(collectionGroup(db, 'activities'))
      .then((snap) => {
        const map: Record<string, string> = {};
        snap.docs.forEach((d) => {
          const t = (d.data().title as string) || '';
          if (t) map[d.id] = t;
        });
        setActNames(map);
      })
      .catch(() => setActNames({}));
  }, []);

  const filtered = useMemo(
    () => (filter === 'all' ? artworks : artworks.filter((a) => a.type === filter)),
    [artworks, filter]
  );

  return (
    <div className="px-4 pt-8 pb-24 mx-auto max-w-[960px]">
      <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--color-text-main)' }}>🖼️ 전체 갤러리</h1>
      <p className="text-sm mb-5" style={{ color: 'var(--color-text-sub)' }}>
        우리 학교 친구들의 모든 전시 작품을 한눈에 볼 수 있어요
      </p>

      {/* 필터 탭 */}
      <div className="flex gap-2 mb-5">
        {([
          { key: 'all', label: '전체' },
          { key: 'flat', label: '그림·글' },
          { key: 'sculpture', label: '조형물' },
        ] as const).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className="rounded-full px-4 py-1.5 text-sm font-bold transition-all"
            style={{
              background: filter === tab.key ? 'var(--color-primary)' : 'var(--color-surface-soft)',
              color: filter === tab.key ? 'white' : 'var(--color-text-sub)',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {fetched && filtered.length === 0 && (
        <div
          className="rounded-2xl p-10 text-center text-sm"
          style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-sub)' }}
        >
          아직 전시된 작품이 없어요
        </div>
      )}

      {/* 벽돌형 그리드 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {filtered.map((art) => (
          <button
            key={art.path}
            onClick={() => setSelected(art)}
            className="rounded-2xl overflow-hidden shadow-md transition-transform hover:scale-[1.02] text-left"
            style={{ background: 'var(--color-surface)' }}
          >
            <div className="h-32 flex items-center justify-center overflow-hidden" style={{ background: 'var(--color-surface-soft)' }}>
              {art.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={art.imageUrl} alt={art.title} className="w-full h-full object-cover" loading="lazy" />
              ) : (
                <span className="text-4xl">{art.type === 'sculpture' ? '🏺' : '🎨'}</span>
              )}
            </div>
            <div className="p-2.5">
              <div className="text-sm font-bold truncate" style={{ color: 'var(--color-text-main)' }}>{art.title}</div>
              <div className="text-[12px] mt-0.5" style={{ color: 'var(--color-text-sub)' }}>{art.artistName}</div>
              {/*
                어디에 걸린 작품인지. 선생님이 갤러리에서 작품을 보고
                '이게 어느 반 어느 활동이더라' 를 되짚을 수가 없었다.
              */}
              <div
                className="text-[12px] mt-1.5 truncate font-bold"
                style={{ color: 'var(--color-primary)' }}
              >
                📍 {whereItHangs(art.path).classId}
                {actNames[whereItHangs(art.path).activityId]
                  ? ` · ${actNames[whereItHangs(art.path).activityId]}`
                  : ''}
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* 작품 상세 — path에서 상위 컬렉션 경로를 잘라내 모달에 전달 */}
      {selected && (
        <div className="fixed inset-0 z-50">
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
          {/*
            '이 작품이 걸린 전시실로' — 갤러리에서 작품만 보고 끝나면
            선생님이 그 반 전시를 통째로 볼 방법이 없었다.
            모달보다 위(z-60)에 띄운다.
          */}
          <button
            onClick={() => {
              const w = whereItHangs(selected.path);
              router.push(`/school/${w.schoolId}/class/${w.classId}/activity/${w.activityId}`);
            }}
            className="fixed left-1/2 z-[60] -translate-x-1/2 rounded-full px-5 py-3 text-[14px] font-bold pos-above-nav"
            style={{ background: '#FFF8E7', color: '#6B5B43', border: '3px solid #EFE3CB', boxShadow: '0 4px 0 #E3D5B8' }}
          >
            🚪 이 작품이 걸린 전시실로
          </button>
        </div>
      )}
    </div>
  );
}
