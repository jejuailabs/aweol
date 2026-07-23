'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { collection, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';

/**
 * 신청 승인.
 *
 * 교직원이 되면 명부(아이들 이름·학생코드)와 전 제출물을 볼 수 있어서,
 * 자기지정으로 열어두면 안 되는 권한이다. 여기서 사람이 한 번 확인한다.
 *
 * **누가 무엇을 승인하는지가 갈린다.**
 * - 학교관리자 → **우리 학교 교사 신청만.** 그 학교 선생님이 맞는지는 그 학교가
 *   제일 잘 알고, 학교가 늘면 총관리자 한 사람이 감당할 수 없다.
 * - 총관리자 → 전부. **학교관리자 임명은 총관리자만** 한다(안 그러면 한 번 뚫린
 *   학교에서 관리자가 계속 늘어난다).
 *
 * 화면에서 거르는 것만으로는 부족해서 **서버(`/api/role` PATCH)가 같은 선을 다시 본다.**
 */

interface Applicant {
  uid: string;
  displayName: string;
  photoURL: string;
  schoolId: string;
  schoolName: string;
  classId: string;
  /** 무엇으로 신청했나 — 학교관리자 신청은 총관리자에게만 보인다 */
  wants: 'teacher' | 'school_admin';
}

export default function TeacherApprovalPage() {
  const router = useRouter();
  const { user, userDoc, actualRole, loading } = useAuth();
  const isSuper = actualRole === 'super_admin';
  const canApprove = isSuper || actualRole === 'school_admin';
  /** 학교관리자는 자기 학교만 본다 */
  const mySchool = userDoc?.schoolIds?.[0] || '';
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
    // 역할 테스트 중이어도 실제 계정 등급으로 판단한다
    if (!loading && (!user || !canApprove)) router.replace('/');
  }, [loading, user, canApprove, router]);

  useEffect(() => {
    if (!db || !canApprove) return;
    // 학교관리자는 학교를 알아야 조회할 수 있다 (규칙도 같은 조건으로 열려 있다).
    // 아직 모르면 구독하지 않는다 — 목록은 비어 있는 채로 둔다.
    if (!isSuper && !mySchool) return;

    /**
     * **질의 조건이 규칙과 정확히 같아야 한다.**
     * 규칙은 '교사 신청 + 내 학교' 문서만 열어주므로, 학교관리자가 그보다 넓게
     * 물으면(예: 학교 조건 없이) 문서 하나가 막히는 순간 질의 전체가 실패한다.
     */
    const q = isSuper
      ? query(collection(db, 'users'), where('pendingRole', 'in', ['teacher', 'school_admin']))
      : query(
          collection(db, 'users'),
          where('pendingRole', '==', 'teacher'),
          where('pendingSchoolId', '==', mySchool)
        );

    return onSnapshot(
      q,
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
              wants: (d.data().pendingRole === 'school_admin' ? 'school_admin' : 'teacher') as Applicant['wants'],
            };
          })
        ),
      () => setList([])
    );
  }, [canApprove, isSuper, mySchool, schoolNames]);

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

  if (loading || !canApprove) return null;

  return (
    <div className="px-4 pt-8 pb-24 mx-auto max-w-[720px]">
      <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--color-text-main)' }}>
        👩‍🏫 선생님 승인
      </h1>
      <p className="text-sm mb-6 leading-relaxed" style={{ color: 'var(--color-text-sub)' }}>
        승인하면 이 계정은 <b>신청한 반</b>의 명부와 제출물을 볼 수 있게 됩니다.
        같은 학교라도 다른 반은 보지 못합니다. 아는 분인지, 그 반 담임이 맞는지 확인해 주세요.
        {!isSuper && <> 우리 학교 신청만 보여요.</>}
      </p>

      {list.length === 0 ? (
        <div className="rounded-2xl py-12 text-center" style={{ background: 'var(--color-surface)' }}>
          <div className="text-4xl mb-2">✅</div>
          <div className="text-sm" style={{ color: 'var(--color-text-sub)' }}>
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
                <div className="text-[13px] font-bold truncate" style={{ color: 'var(--color-primary)' }}>
                  {a.wants === 'school_admin' ? '🏫 학교관리자 신청 · ' : '🏫 '}
                  {a.schoolName}
                  {a.wants === 'school_admin'
                    ? ''
                    : a.classId ? ` · ${a.classId}반` : ' · (반 미지정)'}
                </div>
                <div className="text-[12px] truncate" style={{ color: 'var(--color-text-sub)' }}>
                  {a.uid}
                </div>
              </div>
              <button
                onClick={() => decide(a.uid, false, a.displayName)}
                disabled={!!busy}
                className="shrink-0 rounded-full px-3 py-2 text-[13px] font-bold disabled:opacity-40"
                style={{ background: 'rgba(232,96,76,0.12)', color: '#E8604C' }}
              >
                거절
              </button>
              <button
                onClick={() => decide(a.uid, true, a.displayName)}
                disabled={!!busy}
                className="shrink-0 rounded-full px-3 py-2 text-[13px] font-bold text-white disabled:opacity-40"
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
          className="fixed left-1/2 -translate-x-1/2 bottom-24 z-50 rounded-full px-4 py-2 text-[14px] font-bold text-white"
          style={{ background: 'rgba(20,20,25,0.9)' }}
        >
          {msg}
        </div>
      )}
    </div>
  );
}
