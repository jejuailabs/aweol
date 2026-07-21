'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { collectionGroup, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';

interface Row {
  id: string;
  schoolId: string;
  year: string;
  grade: string;
  classNumber: number;
  coverUrl: string;
  counts: { students: number; artworks: number; homeworks: number; quizzes: number; activities: number };
}

/**
 * 교사 포트폴리오 — 내가 맡았던 반들.
 *
 * 기억창고 요약 문서를 `archivedBy` 로 모은다. collectionGroup 이라 학교를 넘나들며
 * 한 번에 가져온다 — 학교를 옮긴 선생님도 지난 기록을 그대로 들고 간다.
 *
 * 여기서 세는 숫자는 **그 해에 아이들이 만든 것**이지 선생님을 평가하는 점수가 아니다.
 * 순위를 매기거나 남과 비교하는 화면으로 만들지 않는다.
 */
export default function PortfolioPage() {
  const { user, userDoc, loading } = useAuth();
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState('');

  const isStaff = userDoc?.role === 'teacher' || userDoc?.role === 'super_admin';

  useEffect(() => {
    if (!loading && (!user || !isStaff)) router.replace('/');
  }, [loading, user, isStaff, router]);

  useEffect(() => {
    if (!db || !user || !isStaff) return;
    getDocs(query(collectionGroup(db, 'archives'), where('archivedBy', '==', user.uid)))
      .then((snap) =>
        setRows(
          snap.docs.map((d) => ({
            id: d.id,
            // schools/{schoolId}/archives/{id} — 경로에서 학교를 꺼낸다 (추가 읽기 없음)
            schoolId: d.ref.path.split('/')[1],
            ...(d.data() as Omit<Row, 'id' | 'schoolId'>),
          }))
        )
      )
      .catch(() => setErr('기록을 불러오지 못했어요'))
      .finally(() => setBusy(false));
  }, [user, isStaff]);

  const total = rows.reduce(
    (acc, r) => ({
      years: acc.years,
      students: acc.students + (r.counts?.students ?? 0),
      artworks: acc.artworks + (r.counts?.artworks ?? 0),
      activities: acc.activities + (r.counts?.activities ?? 0),
    }),
    { years: 0, students: 0, artworks: 0, activities: 0 }
  );
  total.years = new Set(rows.map((r) => r.year)).size;

  const byYear = rows.reduce<Record<string, Row[]>>((acc, r) => {
    (acc[r.year] ||= []).push(r);
    return acc;
  }, {});
  const years = Object.keys(byYear).sort((a, b) => b.localeCompare(a));

  return (
    <div className="px-4 pt-6 pb-24 mx-auto max-w-[720px]">
      <h1 className="text-lg font-black mb-1" style={{ color: 'var(--color-text-main)' }}>
        📚 나의 발자취
      </h1>
      <p className="text-[13px] mb-5 leading-relaxed" style={{ color: 'var(--color-text-sub)' }}>
        {userDoc?.displayName ?? '선생님'}님이 함께한 반들이에요.
      </p>

      {err && <div className="text-[13px] font-bold mb-3" style={{ color: '#C0392B' }}>{err}</div>}

      {busy ? (
        <div className="text-[14px]" style={{ color: 'var(--color-text-sub)' }}>불러오는 중...</div>
      ) : rows.length === 0 ? (
        <div className="py-12 text-center">
          <div className="text-4xl mb-2">📚</div>
          <div className="text-sm leading-relaxed" style={{ color: 'var(--color-text-sub)' }}>
            아직 기억창고로 옮긴 반이 없어요.<br />
            한 해가 끝나면 반 화면에서 옮길 수 있어요.
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-2 mb-5">
            {([
              ['📅', '해', total.years],
              ['👦', '아이들', total.students],
              ['🖼️', '작품', total.artworks],
              ['🎪', '활동', total.activities],
            ] as [string, string, number][]).map(([emoji, label, n]) => (
              <div key={label} className="rounded-2xl py-3 text-center" style={{ background: 'var(--color-surface)' }}>
                <div className="text-lg">{emoji}</div>
                <div className="text-base font-black" style={{ color: 'var(--color-text-main)' }}>{n}</div>
                <div className="text-[11px]" style={{ color: 'var(--color-text-sub)' }}>{label}</div>
              </div>
            ))}
          </div>

          {years.map((y) => (
            <div key={y} className="mb-4">
              <div className="text-sm font-black mb-2" style={{ color: 'var(--color-text-main)' }}>{y}년</div>
              <div className="flex flex-col gap-2">
                {byYear[y].map((r) => (
                  <button
                    key={`${r.schoolId}-${r.id}`}
                    onClick={() => router.push(`/school/${r.schoolId}/archive`)}
                    className="flex items-center gap-3 rounded-2xl p-3 text-left transition-transform hover:scale-[1.01]"
                    style={{ background: 'var(--color-surface)' }}
                  >
                    <div
                      className="h-12 w-12 rounded-xl overflow-hidden shrink-0 flex items-center justify-center"
                      style={{ background: 'var(--color-surface-soft)' }}
                    >
                      {r.coverUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={r.coverUrl} alt="" className="h-full w-full object-cover" />
                      ) : '🎒'}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-bold" style={{ color: 'var(--color-text-main)' }}>
                        {r.grade}학년 {r.classNumber}반
                      </div>
                      <div className="text-[12px]" style={{ color: 'var(--color-text-sub)' }}>
                        아이 {r.counts?.students ?? 0}명 · 작품 {r.counts?.artworks ?? 0}개 · 활동 {r.counts?.activities ?? 0}개
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
