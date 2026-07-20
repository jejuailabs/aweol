'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { collection, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';

/**
 * 교사 신청 승인.
 *
 * 교직원이 되면 명부(아이들 이름·학생코드)와 전 제출물을 볼 수 있어서,
 * 자기지정으로 열어두면 안 되는 권한이다. 여기서 사람이 한 번 확인한다.
 */

interface Applicant {
  uid: string;
  displayName: string;
  photoURL: string;
  schoolId: string;
  schoolName: string;
  classId: string;
}

export default function TeacherApprovalPage() {
  const router = useRouter();
  const { user, actualRole, loading } = useAuth();
  const [list, setList] = useState<Applicant[]>([]);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [schoolNames, setSchoolNames] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!db) return;
    getDocs(collection(db, 'schools'))
      .then((snap) => {
        const m: Record<string, string> = {};
        snap.docs.forEach((d) => { m[d.id] = d.data().name || d.id; });
        setSchoolNames(m);
      })
      .catch(() => setSchoolNames({}));
  }, []);

  useEffect(() => {
    // 역할 테스트 중이어도 실제 계정이 슈퍼관리자여야 한다
    if (!loading && (!user || actualRole !== 'super_admin')) router.replace('/');
  }, [loading, user, actualRole, router]);

  useEffect(() => {
    if (!db || actualRole !== 'super_admin') return;
    return onSnapshot(
      query(collection(db, 'users'), where('pendingRole', '==', 'teacher')),
      (snap) =>
        setList(
          snap.docs.map((d) => {
            const sid = d.data().pendingSchoolId || '';
            return {
              uid: d.id,
              displayName: d.data().displayName || '이름 없음',
              photoURL: d.data().photoURL || '',
              schoolId: sid,
              schoolName: schoolNames[sid] || sid || '(학교 미지정)',
              classId: d.data().pendingClassId || '',
            };
          })
        ),
      () => setList([])
    );
  }, [actualRole, schoolNames]);

  const decide = useCallback(async (uid: string, approve: boolean, name: string) => {
    setBusy(uid);
    setMsg('');
    try {
      const token = await auth?.currentUser?.getIdToken();
      const res = await fetch('/api/role', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ uid, approve, reject: !approve }),
      });
      const json = await res.json().catch(() => ({}));
      setMsg(res.ok ? `${name} — ${approve ? '승인했어요' : '거절했어요'}` : json.error || '처리하지 못했어요');
    } finally {
      setBusy('');
    }
  }, []);

  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(''), 3000);
    return () => clearTimeout(t);
  }, [msg]);

  if (loading || actualRole !== 'super_admin') return null;

  return (
    <div className="px-4 pt-8 pb-24 mx-auto max-w-[720px]">
      <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--color-text-main)' }}>
        👩‍🏫 선생님 승인
      </h1>
      <p className="text-xs mb-6 leading-relaxed" style={{ color: 'var(--color-text-sub)' }}>
        승인하면 이 계정은 <b>신청한 반</b>의 명부와 제출물을 볼 수 있게 됩니다.
        같은 학교라도 다른 반은 보지 못합니다. 아는 분인지, 그 반 담임이 맞는지 확인해 주세요.
      </p>

      {list.length === 0 ? (
        <div className="rounded-2xl py-12 text-center" style={{ background: 'var(--color-surface)' }}>
          <div className="text-4xl mb-2">✅</div>
          <div className="text-xs" style={{ color: 'var(--color-text-sub)' }}>
            기다리는 신청이 없어요
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {list.map((a) => (
            <div
              key={a.uid}
              className="flex items-center gap-3 rounded-2xl p-3.5 shadow-sm"
              style={{ background: 'var(--color-surface)' }}
            >
              {a.photoURL ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.photoURL} alt="" className="w-10 h-10 rounded-full shrink-0" />
              ) : (
                <div
                  className="w-10 h-10 rounded-full shrink-0 flex items-center justify-center text-lg"
                  style={{ background: 'var(--color-surface-soft)' }}
                >
                  🙂
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold truncate" style={{ color: 'var(--color-text-main)' }}>
                  {a.displayName}
                </div>
                <div className="text-[11px] font-bold truncate" style={{ color: 'var(--color-primary)' }}>
                  🏫 {a.schoolName} {a.classId ? `· ${a.classId}반` : '· (반 미지정)'}
                </div>
                <div className="text-[10px] truncate" style={{ color: 'var(--color-text-sub)' }}>
                  {a.uid}
                </div>
              </div>
              <button
                onClick={() => decide(a.uid, false, a.displayName)}
                disabled={!!busy}
                className="shrink-0 rounded-full px-3 py-2 text-[11px] font-bold disabled:opacity-40"
                style={{ background: 'rgba(232,96,76,0.12)', color: '#E8604C' }}
              >
                거절
              </button>
              <button
                onClick={() => decide(a.uid, true, a.displayName)}
                disabled={!!busy}
                className="shrink-0 rounded-full px-3 py-2 text-[11px] font-bold text-white disabled:opacity-40"
                style={{ background: 'var(--color-primary)' }}
              >
                승인
              </button>
            </div>
          ))}
        </div>
      )}

      {msg && (
        <div
          className="fixed left-1/2 -translate-x-1/2 bottom-24 z-50 rounded-full px-4 py-2 text-[12px] font-bold text-white"
          style={{ background: 'rgba(20,20,25,0.9)' }}
        >
          {msg}
        </div>
      )}
    </div>
  );
}
