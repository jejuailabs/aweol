'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { collection, getDocs, query, where, doc, setDoc } from 'firebase/firestore';
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
  const { user, userDoc, role, loading } = useAuth();
  const [classes, setClasses] = useState<ClassSummary[]>([]);
  const [totalPending, setTotalPending] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [stats, setStats] = useState({ activities: 0, artworks: 0, approved: 0, pending: 0, rejected: 0, students: 0 });
  const [newGrade, setNewGrade] = useState('3');
  const [newClassNum, setNewClassNum] = useState('');
  const [newMotto, setNewMotto] = useState('');
  const [creating, setCreating] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleCreateClass = useCallback(async () => {
    const num = parseInt(newClassNum, 10);
    if (!db || !user || !newGrade || !num || num < 1) return;
    setCreating(true);
    const classId = `${newGrade}-${num}`;
    const year = String(new Date().getFullYear());
    await setDoc(doc(db, 'schools', SCHOOL_ID, 'classes', classId), {
      schoolId: SCHOOL_ID,
      grade: newGrade,
      classNumber: num,
      year,
      teacherUid: user.uid,
      teacherName: userDoc?.displayName || '선생님',
      motto: newMotto.trim() || '함께 웃고, 함께 자라자',
      introText: '',
      isArchived: false,
      memberUids: [user.uid],
    });
    setCreating(false);
    setShowCreate(false);
    setNewClassNum('');
    setNewMotto('');
    setRefreshKey((k) => k + 1);
  }, [newGrade, newClassNum, newMotto, user, userDoc]);

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
      const totals = { activities: 0, artworks: 0, approved: 0, pending: 0, rejected: 0, students: 0 };

      for (const cls of classSnap.docs) {
        const data = cls.data();
        const activitiesSnap = await getDocs(
          collection(db, 'schools', SCHOOL_ID, 'classes', cls.id, 'activities')
        );
        totals.activities += activitiesSnap.size;

        const studentsSnap = await getDocs(
          collection(db, 'schools', SCHOOL_ID, 'classes', cls.id, 'students')
        );
        totals.students += studentsSnap.size;

        let classPending = 0;
        for (const act of activitiesSnap.docs) {
          const artSnap = await getDocs(
            collection(db, 'schools', SCHOOL_ID, 'classes', cls.id, 'activities', act.id, 'artworks')
          );
          totals.artworks += artSnap.size;
          for (const art of artSnap.docs) {
            const st = art.data().status;
            if (st === 'approved') totals.approved += 1;
            else if (st === 'pending') { totals.pending += 1; classPending += 1; }
            else if (st === 'rejected') totals.rejected += 1;
          }
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
      setStats(totals);
    }

    if (!loading && user) fetchData();
  }, [user, role, loading, router, refreshKey]);

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
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold" style={{ color: 'var(--color-text-main)' }}>
          학급 관리
        </h2>
        <button
          onClick={() => setShowCreate(true)}
          className="rounded-full px-4 py-1.5 text-xs font-bold text-white shadow-md transition-transform hover:scale-105"
          style={{ background: 'var(--color-primary)' }}
        >
          + 반 만들기
        </button>
      </div>
      {classes.length === 0 && (
        <div
          className="rounded-2xl p-8 text-center text-xs mb-3"
          style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-sub)' }}
        >
          아직 만든 반이 없어요. &lsquo;+ 반 만들기&rsquo;로 첫 교실을 만들어보세요!<br />
          반을 만들면 학교 건물 창문에 문패가 걸리고 빈 교실이 생깁니다.
        </div>
      )}
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
          onClick={() => setShowStats((v) => !v)}
          className="rounded-2xl p-4 text-left transition-transform hover:scale-[1.02]"
          style={{ background: showStats ? '#E8F5EC' : 'var(--color-surface-soft)' }}
        >
          <div className="text-2xl mb-2">📊</div>
          <div className="text-sm font-bold" style={{ color: 'var(--color-text-main)' }}>통계</div>
          <div className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-sub)' }}>
            {showStats ? '접기' : '활동/참여 현황'}
          </div>
        </button>
      </div>

      {/* 통계 패널 */}
      {showStats && (
        <div className="mt-3 rounded-2xl p-4" style={{ background: 'var(--color-surface-soft)' }}>
          <div className="text-xs font-bold mb-3" style={{ color: 'var(--color-text-main)' }}>
            📊 우리 학교 전시 현황
          </div>
          <div className="grid grid-cols-3 gap-2.5 mb-3">
            {[
              { label: '등록 학생', value: stats.students, color: 'var(--color-text-main)' },
              { label: '수업(활동)', value: stats.activities, color: 'var(--color-text-main)' },
              { label: '전체 작품', value: stats.artworks, color: 'var(--color-text-main)' },
            ].map((s) => (
              <div key={s.label} className="rounded-xl p-3 text-center" style={{ background: 'var(--color-surface)' }}>
                <div className="text-xl font-bold" style={{ color: s.color }}>{s.value}</div>
                <div className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-sub)' }}>{s.label}</div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2.5">
            {[
              { label: '전시 중', value: stats.approved, color: 'var(--color-primary)' },
              { label: '승인 대기', value: stats.pending, color: '#E8A33C' },
              { label: '반려', value: stats.rejected, color: '#E8604C' },
            ].map((s) => (
              <div key={s.label} className="rounded-xl p-3 text-center" style={{ background: 'var(--color-surface)' }}>
                <div className="text-xl font-bold" style={{ color: s.color }}>{s.value}</div>
                <div className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-sub)' }}>{s.label}</div>
              </div>
            ))}
          </div>
          {stats.artworks > 0 && (
            <div className="mt-3 text-[11px] text-center" style={{ color: 'var(--color-text-sub)' }}>
              전시율 {Math.round(stats.approved * 100 / stats.artworks)}% · 학생 1인당 평균{' '}
              {stats.students > 0 ? (stats.artworks / stats.students).toFixed(1) : '—'}점
            </div>
          )}
        </div>
      )}

      {/* 반 만들기 모달 */}
      {showCreate && (
        <div
          className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center px-5"
          style={{ background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(4px)' }}
          onClick={() => setShowCreate(false)}
        >
          <div
            className="modal-card w-full max-w-[360px] rounded-3xl p-6"
            style={{ background: 'var(--color-surface)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center mb-5">
              <div className="text-3xl mb-1">🏫</div>
              <h3 className="text-base font-bold" style={{ color: 'var(--color-text-main)' }}>새 반 만들기</h3>
              <p className="text-[11px] mt-1" style={{ color: 'var(--color-text-sub)' }}>
                만들면 학교 창문에 문패가 걸리고 빈 교실이 생겨요
              </p>
            </div>

            <div className="mb-3">
              <div className="text-[11px] font-bold mb-1.5" style={{ color: 'var(--color-text-sub)' }}>학년</div>
              <div className="grid grid-cols-6 gap-1.5">
                {['1', '2', '3', '4', '5', '6'].map((g) => (
                  <button
                    key={g}
                    onClick={() => setNewGrade(g)}
                    className="rounded-lg py-2 text-sm font-bold transition-all"
                    style={{
                      background: newGrade === g ? 'var(--color-primary)' : 'var(--color-surface-soft)',
                      color: newGrade === g ? 'white' : 'var(--color-text-main)',
                    }}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-3">
              <div className="text-[11px] font-bold mb-1.5" style={{ color: 'var(--color-text-sub)' }}>반 번호</div>
              <input
                type="number"
                min={1}
                max={20}
                value={newClassNum}
                onChange={(e) => setNewClassNum(e.target.value)}
                placeholder="예: 1"
                className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-main)' }}
              />
            </div>

            <div className="mb-5">
              <div className="text-[11px] font-bold mb-1.5" style={{ color: 'var(--color-text-sub)' }}>급훈 (선택)</div>
              <input
                type="text"
                value={newMotto}
                onChange={(e) => setNewMotto(e.target.value)}
                placeholder="함께 웃고, 함께 자라자"
                className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-main)' }}
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setShowCreate(false)}
                className="flex-1 rounded-xl py-3 text-sm font-bold"
                style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-sub)' }}
              >
                취소
              </button>
              <button
                onClick={handleCreateClass}
                disabled={!newClassNum || creating}
                className="flex-1 rounded-xl py-3 text-sm font-bold text-white disabled:opacity-50"
                style={{ background: 'var(--color-primary)' }}
              >
                {creating ? '만드는 중...' : `${newGrade}-${newClassNum || '?'}반 만들기`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
