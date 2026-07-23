'use client';

import { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';

/**
 * 아이 로그인 칸 — **학교 · 학년 · 반 · 이름 · 비밀번호**.
 *
 * 앞의 셋은 고르는 것이고(아이가 칠 것이 없다), 실제로 치는 것은 **이름과
 * 비밀번호 둘뿐**이다. 비밀번호는 반에 하나라 선생님이 칠판에 적어두면 된다.
 *
 * **이름을 목록에서 고르게 하지 않았다.** 그러려면 명부를 내려줘야 하는데,
 * 그건 로그인도 안 한 사람에게 반 아이들 이름을 전부 보여주는 일이다.
 * 그래서 아이가 자기 이름을 친다 — 맞는지는 서버만 안다.
 */
export default function StudentLoginPanel({ onDone }: { onDone: () => void }) {
  const { signInAsStudent } = useAuth();
  const [schools, setSchools] = useState<{ id: string; name: string }[]>([]);
  const [schoolId, setSchoolId] = useState('');
  /** 그 학교의 반 목록 (보관된 반은 뺀다 — 지난 해 반으로 들어갈 일은 없다) */
  const [classes, setClasses] = useState<{ id: string; grade: string; num: number }[]>([]);
  const [grade, setGrade] = useState('');
  const [classId, setClassId] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!db) return;
    getDocs(collection(db, 'schools'))
      .then((snap) =>
        setSchools(snap.docs.map((d) => ({ id: d.id, name: (d.data().name as string) || d.id })))
      )
      .catch(() => setSchools([]));
  }, []);

  /**
   * 학교가 하나뿐이면 고를 것이 없다 — 묻지 않고 그 학교로 친다.
   * (상태로 밀어넣지 않고 여기서 정한다. effect 안에서 상태를 고치면 렌더가 연쇄된다)
   */
  const pickedSchool = schoolId || (schools.length === 1 ? schools[0].id : '');

  useEffect(() => {
    if (!db || !pickedSchool) return;
    getDocs(query(collection(db, 'schools', pickedSchool, 'classes'), where('isArchived', '==', false)))
      .then((snap) =>
        setClasses(
          snap.docs
            .map((d) => ({
              id: d.id,
              grade: String(d.data().grade ?? ''),
              num: Number(d.data().classNumber ?? 0),
            }))
            .sort((a, b) => a.grade.localeCompare(b.grade) || a.num - b.num)
        )
      )
      .catch(() => setClasses([]));
  }, [pickedSchool]);

  const grades = [...new Set(classes.map((c) => c.grade))].filter(Boolean).sort();
  const inGrade = classes.filter((c) => c.grade === grade);

  const submit = async () => {
    if (!pickedSchool || !classId || !name.trim() || !password.trim()) return;
    setBusy(true); setErr('');
    try {
      await signInAsStudent({ schoolId: pickedSchool, classId, name, password });
      onDone();
    } catch (e) {
      setErr((e as Error).message || '들어가지 못했어요');
    } finally {
      // 성공하든 실패하든 반드시 푼다 — 없으면 버튼이 잠긴 채로 남는다
      setBusy(false);
    }
  };

  const chip = (on: boolean) => ({
    background: on ? 'var(--color-primary)' : 'rgba(255,255,255,0.85)',
    color: on ? 'white' : 'var(--color-text-sub)',
  });

  return (
    <div className="w-full max-w-[340px]">
      {schools.length > 1 && (
        <>
          <div className="text-[13px] font-bold mb-1.5" style={{ color: 'var(--color-text-sub)' }}>
            학교
          </div>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {schools.map((s) => (
              <button
                key={s.id}
                onClick={() => { setSchoolId(s.id); setGrade(''); setClassId(''); }}
                className="rounded-xl px-3.5 py-2 text-[14px] font-bold"
                style={chip(pickedSchool === s.id)}
              >
                {s.name}
              </button>
            ))}
          </div>
        </>
      )}

      {pickedSchool && (
        <>
          <div className="text-[13px] font-bold mb-1.5" style={{ color: 'var(--color-text-sub)' }}>
            학년
          </div>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {grades.map((g) => (
              <button
                key={g}
                onClick={() => { setGrade(g); setClassId(''); }}
                className="rounded-xl px-3.5 py-2 text-[14px] font-bold"
                style={chip(grade === g)}
              >
                {g}학년
              </button>
            ))}
          </div>
        </>
      )}

      {grade && (
        <>
          <div className="text-[13px] font-bold mb-1.5" style={{ color: 'var(--color-text-sub)' }}>
            반
          </div>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {inGrade.map((c) => (
              <button
                key={c.id}
                onClick={() => setClassId(c.id)}
                className="rounded-xl px-3.5 py-2 text-[14px] font-bold"
                style={chip(classId === c.id)}
              >
                {c.num}반
              </button>
            ))}
          </div>
        </>
      )}

      {classId && (
        <>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="내 이름"
            autoComplete="off"
            className="w-full rounded-xl px-3.5 py-3 text-[15px] outline-none mb-2"
            style={{ background: 'rgba(255,255,255,0.95)', color: 'var(--color-text-main)' }}
          />
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
            placeholder="우리 반 비밀번호"
            type="password"
            autoComplete="off"
            className="w-full rounded-xl px-3.5 py-3 text-[15px] outline-none mb-2"
            style={{ background: 'rgba(255,255,255,0.95)', color: 'var(--color-text-main)' }}
          />
          <p className="text-[12px] mb-3 leading-relaxed" style={{ color: 'var(--color-text-sub)' }}>
            비밀번호는 <b>우리 반 모두 같아요.</b> 선생님이 알려주신 것을 넣으세요.
            이름이 같은 친구가 있으면 <b>이름 뒤에 A·B</b>를 붙여요.
          </p>

          <button
            onClick={submit}
            disabled={busy || !name.trim() || !password.trim()}
            className="w-full rounded-full py-3 font-bold text-white shadow-lg disabled:opacity-50"
            style={{ background: 'var(--color-primary)' }}
          >
            {busy ? '들어가는 중...' : '🎒 들어가기'}
          </button>
        </>
      )}

      {err && (
        <div className="mt-3 text-[14px] font-bold text-center" style={{ color: '#C0392B' }}>
          {err}
        </div>
      )}
    </div>
  );
}
