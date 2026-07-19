'use client';

import { useEffect, useState } from 'react';
import { collection, collectionGroup, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { ArtworkDoc } from '@/lib/firestore-schema';

type ArtworkItem = ArtworkDoc & { id: string; path: string };

export default function GalleryPage() {
  const [artworks, setArtworks] = useState<ArtworkItem[]>([]);
  const [filter, setFilter] = useState<'all' | 'flat' | 'sculpture'>('all');
  const [fetched, setFetched] = useState(false);

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

  const filtered = filter === 'all' ? artworks : artworks.filter((a) => a.type === filter);

  return (
    <div className="px-4 pt-8 pb-24 mx-auto max-w-[960px]">
      <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--color-text-main)' }}>🖼️ 전체 갤러리</h1>
      <p className="text-xs mb-5" style={{ color: 'var(--color-text-sub)' }}>
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
            className="rounded-full px-4 py-1.5 text-xs font-bold transition-all"
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
          className="rounded-2xl p-10 text-center text-xs"
          style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-sub)' }}
        >
          아직 전시된 작품이 없어요
        </div>
      )}

      {/* 벽돌형 그리드 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {filtered.map((art) => (
          <div
            key={art.path}
            className="rounded-2xl overflow-hidden shadow-md transition-transform hover:scale-[1.02]"
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
              <div className="text-xs font-bold truncate" style={{ color: 'var(--color-text-main)' }}>{art.title}</div>
              <div className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-sub)' }}>{art.artistName}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
