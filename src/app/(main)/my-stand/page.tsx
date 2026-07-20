'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { collection, collectionGroup, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { ArtworkDoc } from '@/lib/firestore-schema';
import { useAuth } from '@/lib/auth-context';
import { AVATAR_PRESETS } from '@/lib/avatar-presets';


interface BadgeDef {
  id: string;
  emoji: string;
  label: string;
  desc: string;
  earned: (stats: { artworks: number; approved: number }) => boolean;
}

const BADGES: BadgeDef[] = [
  { id: 'first-art', emoji: '🌱', label: '첫 작품', desc: '첫 작품을 올렸어요', earned: (s) => s.artworks >= 1 },
  { id: 'approved', emoji: '⭐', label: '전시 데뷔', desc: '작품이 전시실에 걸렸어요', earned: (s) => s.approved >= 1 },
  { id: 'three-arts', emoji: '🎨', label: '꼬마 화가', desc: '작품 3개를 올렸어요', earned: (s) => s.artworks >= 3 },
  { id: 'five-arts', emoji: '🏆', label: '열정 예술가', desc: '작품 5개를 올렸어요', earned: (s) => s.artworks >= 5 },
  { id: 'ten-arts', emoji: '👑', label: '전시왕', desc: '작품 10개를 올렸어요', earned: (s) => s.artworks >= 10 },
  { id: 'all-approved', emoji: '💎', label: '완벽주의자', desc: '올린 작품이 모두 승인됐어요', earned: (s) => s.artworks >= 2 && s.approved === s.artworks },
];

export default function MyStandPage() {
  const router = useRouter();
  const { user, userDoc, loading } = useAuth();
  const [myArtworks, setMyArtworks] = useState<(ArtworkDoc & { id: string })[]>([]);
  const [fetched, setFetched] = useState(false);

  useEffect(() => {
    async function fetchMine() {
      if (!db || !user) return;
      try {
        const q = query(collectionGroup(db, 'artworks'), where('artistUid', '==', user.uid));
        const snap = await getDocs(q);
        setMyArtworks(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ArtworkDoc & { id: string })));
      } catch (e) {
        // collection-group 인덱스가 없으면 반→활동 순회로 폴백
        console.warn('collectionGroup 쿼리 실패, 순회 방식으로 폴백:', e);
        try {
          const list: (ArtworkDoc & { id: string })[] = [];
          const classSnap = await getDocs(collection(db, 'schools', 'aewol-elementary', 'classes'));
          for (const cls of classSnap.docs) {
            const actSnap = await getDocs(
              collection(db, 'schools', 'aewol-elementary', 'classes', cls.id, 'activities')
            );
            for (const act of actSnap.docs) {
              const artSnap = await getDocs(
                query(
                  collection(db, 'schools', 'aewol-elementary', 'classes', cls.id, 'activities', act.id, 'artworks'),
                  where('artistUid', '==', user.uid)
                )
              );
              artSnap.docs.forEach((d) => list.push({ id: d.id, ...d.data() } as ArtworkDoc & { id: string }));
            }
          }
          setMyArtworks(list);
        } catch (e2) {
          console.error('Failed to fetch my artworks:', e2);
        }
      }
      setFetched(true);
    }
    fetchMine();
  }, [user]);

  if (!loading && !user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-6 gap-4">
        <span className="text-5xl">⭐</span>
        <p className="text-sm" style={{ color: 'var(--color-text-sub)' }}>내 스탠드를 보려면 로그인이 필요해요</p>
        <button
          onClick={() => router.push('/login')}
          className="rounded-full px-6 py-2.5 text-sm font-bold text-white"
          style={{ background: 'var(--color-primary)' }}
        >
          로그인하기
        </button>
      </div>
    );
  }

  const stats = {
    artworks: myArtworks.length,
    approved: myArtworks.filter((a) => a.status === 'approved').length,
  };
  const earnedBadges = BADGES.filter((b) => b.earned(stats));
  const avatarEmoji = AVATAR_PRESETS.find((a) => a.id === userDoc?.avatarId)?.emoji ?? '🙂';

  return (
    <div className="px-4 pt-8 pb-24 mx-auto max-w-[960px]">
      {/* 프로필 카드 */}
      <div
        className="rounded-3xl p-6 mb-6 shadow-md flex items-center gap-4"
        style={{ background: 'linear-gradient(135deg, var(--color-sky) 0%, var(--color-surface) 100%)' }}
      >
        <div
          className="flex h-20 w-20 items-center justify-center rounded-full text-5xl shadow-inner"
          style={{ background: 'var(--color-surface)' }}
        >
          {avatarEmoji}
        </div>
        <div>
          <h1 className="text-lg font-bold" style={{ color: 'var(--color-text-main)' }}>
            {userDoc?.displayName || '이름 없음'}
          </h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-sub)' }}>
            작품 {stats.artworks}개 · 전시 중 {stats.approved}개 · 배지 {earnedBadges.length}개
          </p>
          <button
            onClick={() => router.push('/avatar-select')}
            className="mt-2 rounded-full px-3 py-1 text-[10px] font-bold"
            style={{ background: 'var(--color-primary)', color: 'white' }}
          >
            아바타 바꾸기
          </button>
        </div>
      </div>

      {/* 도장/배지 */}
      <h2 className="text-sm font-bold mb-3" style={{ color: 'var(--color-text-main)' }}>🏅 도장 모으기</h2>
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mb-8">
        {BADGES.map((badge) => {
          const earned = badge.earned(stats);
          return (
            <div
              key={badge.id}
              className="flex flex-col items-center gap-1 rounded-2xl p-3 text-center"
              style={{
                background: 'var(--color-surface)',
                boxShadow: earned ? '0 2px 8px rgba(255,201,60,0.4)' : '0 1px 4px rgba(0,0,0,0.06)',
                border: earned ? '2px solid var(--color-accent-yellow)' : '2px solid transparent',
                opacity: earned ? 1 : 0.45,
                filter: earned ? 'none' : 'grayscale(1)',
              }}
            >
              <span className="text-3xl">{badge.emoji}</span>
              <span className="text-[10px] font-bold" style={{ color: 'var(--color-text-main)' }}>{badge.label}</span>
              <span className="text-[8px] leading-tight" style={{ color: 'var(--color-text-sub)' }}>{badge.desc}</span>
            </div>
          );
        })}
      </div>

      {/* 내 작품 목록 */}
      <h2 className="text-sm font-bold mb-3" style={{ color: 'var(--color-text-main)' }}>🖼️ 내 작품</h2>
      {fetched && myArtworks.length === 0 && (
        <div
          className="rounded-2xl p-8 text-center text-xs"
          style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-sub)' }}
        >
          아직 올린 작품이 없어요. 전시실에서 작품을 올려보세요!
        </div>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {myArtworks.map((art) => (
          <div
            key={art.id}
            className="rounded-2xl overflow-hidden shadow-md"
            style={{ background: 'var(--color-surface)' }}
          >
            <div className="h-28 flex items-center justify-center overflow-hidden" style={{ background: 'var(--color-surface-soft)' }}>
              {art.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={art.imageUrl} alt={art.title} className="w-full h-full object-cover" />
              ) : (
                <span className="text-3xl">🎨</span>
              )}
            </div>
            <div className="p-2.5">
              <div className="text-xs font-bold truncate" style={{ color: 'var(--color-text-main)' }}>{art.title}</div>
              <span
                className="mt-1 inline-block rounded-full px-2 py-0.5 text-[9px] font-bold"
                style={{
                  background: art.status === 'approved' ? 'rgba(62,196,109,0.15)' : art.status === 'pending' ? 'rgba(255,201,60,0.2)' : 'rgba(255,107,107,0.15)',
                  color: art.status === 'approved' ? 'var(--color-primary-dark)' : art.status === 'pending' ? '#B8860B' : '#C0392B',
                }}
              >
                {art.status === 'approved' ? '전시 중' : art.status === 'pending' ? '승인 대기' : '반려됨'}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
