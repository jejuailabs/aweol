'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { collectionGroup, query, where, getDocs, getDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { ArtworkDoc } from '@/lib/firestore-schema';
import { useAuth } from '@/lib/auth-context';
import { canApproveArtwork } from '@/lib/auth-helpers';


interface PendingArtwork {
  id: string;
  classId: string;
  activityId: string;
  activityTitle: string;
  data: ArtworkDoc;
  docPath: string;
}

export default function ApprovalPage() {
  const router = useRouter();
  const schoolId = useParams().schoolId as string;
  const { user, role, loading } = useAuth();
  const [pending, setPending] = useState<PendingArtwork[]>([]);
  const [fetching, setFetching] = useState(true);
  const [rejectTarget, setRejectTarget] = useState<PendingArtwork | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  useEffect(() => {
    if (!loading && (!user || !canApproveArtwork(role))) {
      router.replace('/');
      return;
    }

    /**
     * 대기 중인 작품만 collectionGroup 으로 한 번에 가져온다.
     *
     * 예전에는 반 → 활동 → 작품을 3중으로 돌면서 전부 읽고 나서 pending 만 걸러냈다.
     * 대기 작품이 0개여도 학교의 모든 작품을 읽는 구조라, 학교가 늘면
     * 이 화면 한 번 여는 데 수만 건이 나갔다(무료 한도가 하루 5만 건이다).
     * 지금은 실제로 대기 중인 문서 수만큼만 읽는다.
     */
    async function fetch() {
      if (!db) return;
      const snap = await getDocs(
        query(collectionGroup(db, 'artworks'), where('status', '==', 'pending'))
      );

      // collectionGroup 은 학교를 가릴 수 없으니 경로로 걸러낸다 (추가 읽기 없음)
      const prefix = `schools/${schoolId}/classes/`;
      const items: PendingArtwork[] = snap.docs
        .filter((d) => d.ref.path.startsWith(prefix))
        .map((d) => {
          const seg = d.ref.path.split('/');
          // schools/{s}/classes/{c}/activities/{a}/artworks/{id}
          return {
            id: d.id,
            classId: seg[3],
            activityId: seg[5],
            activityTitle: seg[5],
            data: d.data() as ArtworkDoc,
            docPath: d.ref.path,
          };
        });

      // 활동 제목은 걸린 작품에 해당하는 것만 따로 읽는다 (보통 한두 개)
      const actPaths = [...new Set(items.map((i) => `${prefix}${i.classId}/activities/${i.activityId}`))];
      const titles = new Map<string, string>();
      await Promise.all(
        actPaths.map(async (p) => {
          const s = await getDoc(doc(db!, p));
          if (s.exists()) titles.set(p, (s.data().title as string) || '');
        })
      );
      items.forEach((i) => {
        const t = titles.get(`${prefix}${i.classId}/activities/${i.activityId}`);
        if (t) i.activityTitle = t;
      });

      setPending(items);
      setFetching(false);
    }

    if (!loading && user) fetch();
  }, [user, role, loading, router]);

  const handleApprove = async (item: PendingArtwork) => {
    if (!db) return;
    await updateDoc(doc(db, item.docPath), { status: 'approved' });
    setPending((prev) => prev.filter((p) => p.id !== item.id));
  };

  const handleReject = async () => {
    if (!db || !rejectTarget) return;
    await updateDoc(doc(db, rejectTarget.docPath), {
      status: 'rejected',
      rejectionReason: rejectReason.trim() || null,
    });
    setPending((prev) => prev.filter((p) => p.id !== rejectTarget.id));
    setRejectTarget(null);
    setRejectReason('');
  };

  if (loading || fetching) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-sm" style={{ color: 'var(--color-text-sub)' }}>로딩 중...</div>
      </div>
    );
  }

  return (
    <div className="px-4 pt-6 pb-24">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.push(`/admin/${schoolId}`)}
          className="text-sm"
          style={{ color: 'var(--color-text-sub)' }}
        >
          ← 대시보드
        </button>
        <h1 className="text-xl font-bold" style={{ color: 'var(--color-text-main)' }}>
          작품 승인
        </h1>
        {pending.length > 0 && (
          <span
            className="text-sm font-bold px-2 py-1 rounded-full"
            style={{ background: '#FF6B6B', color: 'white' }}
          >
            {pending.length}
          </span>
        )}
      </div>

      {pending.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-5xl mb-4">✅</div>
          <div className="text-sm font-bold mb-1" style={{ color: 'var(--color-text-main)' }}>
            모든 작품이 처리되었어요!
          </div>
          <div className="text-sm" style={{ color: 'var(--color-text-sub)' }}>
            대기 중인 작품이 없습니다
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {pending.map((item) => (
            <div
              key={item.id}
              className="rounded-2xl overflow-hidden shadow-sm"
              style={{ background: 'var(--color-surface-soft)' }}
            >
              {/* 작품 이미지 */}
              <div
                className="w-full aspect-[4/3] flex items-center justify-center"
                style={{ background: 'var(--color-surface)' }}
              >
                {item.data.imageUrl ? (
                  <img src={item.data.imageUrl} alt={item.data.title} className="w-full h-full object-contain" />
                ) : (
                  <span className="text-5xl">{item.data.type === 'sculpture' ? '🏺' : '🎨'}</span>
                )}
              </div>

              {/* 작품 정보 */}
              <div className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <div className="text-sm font-bold" style={{ color: 'var(--color-text-main)' }}>
                      {item.data.title}
                    </div>
                    <div className="text-[12px]" style={{ color: 'var(--color-text-sub)' }}>
                      {item.data.artistName} · {item.classId} · {item.activityTitle}
                    </div>
                  </div>
                </div>

                {item.data.artistComment && (
                  <div className="text-sm mb-3 italic" style={{ color: 'var(--color-text-sub)' }}>
                    &ldquo;{item.data.artistComment}&rdquo;
                  </div>
                )}

                {/* 승인/반려 버튼 */}
                <div className="flex gap-2">
                  <button
                    onClick={() => handleApprove(item)}
                    className="flex-1 rounded-xl py-2.5 text-sm font-bold text-white transition-transform hover:scale-[1.02]"
                    style={{ background: 'var(--color-primary)' }}
                  >
                    승인
                  </button>
                  <button
                    onClick={() => setRejectTarget(item)}
                    className="flex-1 rounded-xl py-2.5 text-sm font-bold transition-transform hover:scale-[1.02]"
                    style={{ background: '#FF6B6B20', color: '#FF6B6B' }}
                  >
                    반려
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 반려 사유 모달 */}
      {rejectTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setRejectTarget(null); }}
        >
          <div
            className="mx-4 w-full max-w-[380px] rounded-2xl p-5"
            style={{ background: 'var(--color-surface)' }}
          >
            <h3 className="text-base font-bold mb-1" style={{ color: 'var(--color-text-main)' }}>
              작품 반려
            </h3>
            <p className="text-sm mb-4" style={{ color: 'var(--color-text-sub)' }}>
              &ldquo;{rejectTarget.data.title}&rdquo; — {rejectTarget.data.artistName}
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="반려 사유를 입력하세요 (선택)"
              rows={3}
              className="w-full rounded-xl px-3 py-2.5 text-sm outline-none resize-none mb-4"
              style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-main)' }}
            />
            <div className="flex gap-2">
              <button
                onClick={() => { setRejectTarget(null); setRejectReason(''); }}
                className="flex-1 rounded-xl py-2.5 text-sm font-bold"
                style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-sub)' }}
              >
                취소
              </button>
              <button
                onClick={handleReject}
                className="flex-1 rounded-xl py-2.5 text-sm font-bold text-white"
                style={{ background: '#FF6B6B' }}
              >
                반려 확인
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
