'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { canAccessAdmin } from '@/lib/auth-helpers';

const SCHOOL_ID = 'aewol-elementary';

interface ClassSummary {
  id: string;
  grade: string;
  classNumber: number;
  teacherName: string;
  pendingCount: number;
}

export default function AdminPage() {
  const router = useRouter();
  const { user, role, loading } = useAuth();
  const [classes, setClasses] = useState<ClassSummary[]>([]);
  const [totalPending, setTotalPending] = useState(0);

  useEffect(() => {
    if (!loading && (!user || !canAccessAdmin(role))) {
      router.replace('/school');
      return;
    }

    async function fetchData() {
      if (!db) return;
      const classSnap = await getDocs(
        query(collection(db, 'schools', SCHOOL_ID, 'classes'), where('isArchived', '==', false))
      );

      let pending = 0;
      const summaries: ClassSummary[] = [];

      for (const cls of classSnap.docs) {
        const data = cls.data();
        const activitiesSnap = await getDocs(
          collection(db, 'schools', SCHOOL_ID, 'classes', cls.id, 'activities')
        );

        let classPending = 0;
        for (const act of activitiesSnap.docs) {
          const artSnap = await getDocs(
            collection(db, 'schools', SCHOOL_ID, 'classes', cls.id, 'activities', act.id, 'artworks')
          );
          classPending += artSnap.docs.filter((d) => d.data().status === 'pending').length;
        }

        pending += classPending;
        summaries.push({
          id: cls.id,
          grade: data.grade,
          classNumber: data.classNumber,
          teacherName: data.teacherName,
          pendingCount: classPending,
        });
      }

      summaries.sort((a, b) => a.classNumber - b.classNumber);
      setClasses(summaries);
      setTotalPending(pending);
    }

    if (!loading && user) fetchData();
  }, [user, role, loading, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-sm" style={{ color: 'var(--color-text-sub)' }}>로딩 중...</div>
      </div>
    );
  }

  return (
    <div className="px-4 pt-6 pb-24">
      <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--color-text-main)' }}>
        교사 대시보드
      </h1>
      <p className="text-xs mb-6" style={{ color: 'var(--color-text-sub)' }}>
        학급과 작품을 관리하세요
      </p>

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="rounded-2xl p-4" style={{ background: 'var(--color-surface-soft)' }}>
          <div className="text-2xl font-bold" style={{ color: 'var(--color-primary)' }}>
            {classes.length}
          </div>
          <div className="text-xs mt-1" style={{ color: 'var(--color-text-sub)' }}>학급 수</div>
        </div>
        <button
          onClick={() => router.push('/admin/approval')}
          className="rounded-2xl p-4 text-left transition-transform hover:scale-[1.02]"
          style={{ background: totalPending > 0 ? '#FFF3E0' : 'var(--color-surface-soft)' }}
        >
          <div className="text-2xl font-bold" style={{ color: totalPending > 0 ? '#FF6B6B' : 'var(--color-text-main)' }}>
            {totalPending}
          </div>
          <div className="text-xs mt-1" style={{ color: 'var(--color-text-sub)' }}>
            승인 대기 작품
          </div>
        </button>
      </div>

      {/* 학급 목록 */}
      <h2 className="text-sm font-bold mb-3" style={{ color: 'var(--color-text-main)' }}>
        학급 관리
      </h2>
      <div className="flex flex-col gap-2.5">
        {classes.map((cls) => (
          <button
            key={cls.id}
            onClick={() => router.push(`/admin/class/${cls.id}`)}
            className="flex items-center justify-between rounded-2xl p-4 transition-all hover:scale-[1.01]"
            style={{ background: 'var(--color-surface-soft)' }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold"
                style={{ background: 'var(--color-primary)', color: 'white' }}
              >
                {cls.classNumber}
              </div>
              <div className="text-left">
                <div className="text-sm font-bold" style={{ color: 'var(--color-text-main)' }}>
                  {cls.grade}-{cls.classNumber}반
                </div>
                <div className="text-[10px]" style={{ color: 'var(--color-text-sub)' }}>
                  {cls.teacherName}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {cls.pendingCount > 0 && (
                <span
                  className="text-[10px] font-bold px-2 py-1 rounded-full"
                  style={{ background: '#FF6B6B', color: 'white' }}
                >
                  {cls.pendingCount} 대기
                </span>
              )}
              <span style={{ color: 'var(--color-text-sub)' }}>›</span>
            </div>
          </button>
        ))}
      </div>

      {/* 빠른 메뉴 */}
      <h2 className="text-sm font-bold mb-3 mt-6" style={{ color: 'var(--color-text-main)' }}>
        빠른 메뉴
      </h2>
      <div className="grid grid-cols-2 gap-2.5">
        <button
          onClick={() => router.push('/admin/approval')}
          className="rounded-2xl p-4 text-left"
          style={{ background: 'var(--color-surface-soft)' }}
        >
          <div className="text-2xl mb-2">✅</div>
          <div className="text-sm font-bold" style={{ color: 'var(--color-text-main)' }}>작품 승인</div>
          <div className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-sub)' }}>
            대기 중인 작품 검토
          </div>
        </button>
        <button
          onClick={() => router.push('/admin/roster')}
          className="rounded-2xl p-4 text-left"
          style={{ background: 'var(--color-surface-soft)' }}
        >
          <div className="text-2xl mb-2">📋</div>
          <div className="text-sm font-bold" style={{ color: 'var(--color-text-main)' }}>학생 명부</div>
          <div className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-sub)' }}>
            엑셀 업로드/관리
          </div>
        </button>
        <button
          className="rounded-2xl p-4 text-left"
          style={{ background: 'var(--color-surface-soft)' }}
        >
          <div className="text-2xl mb-2">📊</div>
          <div className="text-sm font-bold" style={{ color: 'var(--color-text-main)' }}>통계</div>
          <div className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-sub)' }}>
            활동/참여 현황
          </div>
        </button>
        <button
          className="rounded-2xl p-4 text-left"
          style={{ background: 'var(--color-surface-soft)' }}
        >
          <div className="text-2xl mb-2">⚙️</div>
          <div className="text-sm font-bold" style={{ color: 'var(--color-text-main)' }}>설정</div>
          <div className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-sub)' }}>
            학급/학교 설정
          </div>
        </button>
      </div>
    </div>
  );
}
