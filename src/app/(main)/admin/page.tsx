'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';

/**
 * 총관리자 전용 — 학교 목록.
 *
 * 지금까지 관리 화면은 /admin/[schoolId] 하나뿐이라, 학교가 여러 개가 되면
 * 주소를 직접 쳐야 다른 학교로 갈 수 있었다. 여기서 전체를 보고 골라 들어간다.
 */

interface SchoolRow {
  id: string;
  name: string;
  tagline: string;
  imageUrl: string;
  classCount: number;
  activityCount: number;
}

export default function AdminHomePage() {
  const router = useRouter();
  const { user, actualRole, loading } = useAuth();
  const [rows, setRows] = useState<SchoolRow[]>([]);
  const [pendingTeachers, setPendingTeachers] = useState(0);
  const [fetched, setFetched] = useState(false);

  useEffect(() => {
    // 역할 테스트 중이어도 실제 계정이 총관리자여야 한다
    if (!loading && (!user || actualRole !== 'super_admin')) router.replace('/');
  }, [loading, user, actualRole, router]);

  useEffect(() => {
    if (!db || actualRole !== 'super_admin') return;
    let alive = true;

    (async () => {
      try {
        const snap = await getDocs(collection(db, 'schools'));
        const list = await Promise.all(
          snap.docs.map(async (d) => {
            const v = d.data();
            const classes = await getDocs(
              query(collection(db!, 'schools', d.id, 'classes'), where('isArchived', '==', false))
            );
            // 전시 중인 활동 수 — 학교 규모를 가늠하는 데 반 수보다 낫다
            let activityCount = 0;
            await Promise.all(
              classes.docs.map(async (c) => {
                const acts = await getDocs(
                  collection(db!, 'schools', d.id, 'classes', c.id, 'activities')
                );
                activityCount += acts.size;
              })
            );
            return {
              id: d.id,
              name: (v.name as string) || d.id,
              tagline: (v.tagline as string) || '',
              imageUrl: (v.imageUrl as string) || '',
              classCount: classes.size,
              activityCount,
            };
          })
        );
        if (!alive) return;
        list.sort((a, b) => a.name.localeCompare(b.name));
        setRows(list);
      } catch {
        if (alive) setRows([]);
      }

      try {
        const p = await getDocs(
          query(collection(db!, 'users'), where('pendingRole', '==', 'teacher'))
        );
        if (alive) setPendingTeachers(p.size);
      } catch {
        if (alive) setPendingTeachers(0);
      }
      if (alive) setFetched(true);
    })();

    return () => { alive = false; };
  }, [actualRole]);

  if (loading || actualRole !== 'super_admin') return null;

  return (
    <div className="px-4 pt-6 pb-24 mx-auto max-w-[860px]">
      <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--color-text-main)' }}>
        🗂️ 전체 학교 관리
      </h1>
      <p className="text-xs mb-5" style={{ color: 'var(--color-text-sub)' }}>
        학교를 골라 들어가면 그 학교의 대시보드가 열려요
      </p>

      {/* 처리할 일 */}
      <div className="flex gap-2 mb-5">
        <button
          onClick={() => router.push('/admin/teachers')}
          className="flex-1 rounded-2xl p-4 text-left transition-transform hover:scale-[1.02]"
          style={{ background: 'var(--color-surface-soft)' }}
        >
          <div className="text-2xl mb-1">👩‍🏫</div>
          <div className="text-sm font-bold" style={{ color: 'var(--color-text-main)' }}>
            선생님 승인
          </div>
          <div className="text-[10px] mt-0.5" style={{ color: pendingTeachers > 0 ? 'var(--color-primary)' : 'var(--color-text-sub)' }}>
            {pendingTeachers > 0 ? `${pendingTeachers}명 기다리는 중` : '기다리는 신청 없음'}
          </div>
        </button>
        <button
          onClick={() => router.push('/admin/logs')}
          className="flex-1 rounded-2xl p-4 text-left transition-transform hover:scale-[1.02]"
          style={{ background: 'var(--color-surface-soft)' }}
        >
          <div className="text-2xl mb-1">🔎</div>
          <div className="text-sm font-bold" style={{ color: 'var(--color-text-main)' }}>
            접근 기록
          </div>
          <div className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-sub)' }}>
            작성자·IP 확인
          </div>
        </button>
      </div>

      <h2 className="text-sm font-bold mb-2" style={{ color: 'var(--color-text-main)' }}>
        🏫 학교 {rows.length}곳
      </h2>

      {!fetched ? (
        <div className="rounded-2xl py-10 text-center text-xs" style={{ background: 'var(--color-surface)', color: 'var(--color-text-sub)' }}>
          불러오는 중...
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl py-10 text-center" style={{ background: 'var(--color-surface)' }}>
          <div className="text-3xl mb-2">🏫</div>
          <div className="text-xs mb-3" style={{ color: 'var(--color-text-sub)' }}>
            아직 만든 학교가 없어요
          </div>
          <button
            onClick={() => router.push('/')}
            className="rounded-full px-4 py-2 text-[12px] font-bold text-white"
            style={{ background: 'var(--color-primary)' }}
          >
            지도에서 학교 만들기
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((s) => (
            <button
              key={s.id}
              onClick={() => router.push(`/admin/${s.id}`)}
              className="flex items-center gap-3 rounded-2xl p-3.5 text-left transition-transform hover:scale-[1.01]"
              style={{ background: 'var(--color-surface)' }}
            >
              <div
                className="h-12 w-12 shrink-0 rounded-xl overflow-hidden flex items-center justify-center"
                style={{ background: 'var(--color-surface-soft)' }}
              >
                {s.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.imageUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-xl">🏫</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold truncate" style={{ color: 'var(--color-text-main)' }}>
                  {s.name}
                </div>
                <div className="text-[10px] truncate" style={{ color: 'var(--color-text-sub)' }}>
                  {s.tagline || s.id}
                </div>
                <div className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-sub)' }}>
                  반 {s.classCount}개 · 전시 {s.activityCount}개
                </div>
              </div>
              <span className="shrink-0 text-sm" style={{ color: 'var(--color-text-sub)' }}>›</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
