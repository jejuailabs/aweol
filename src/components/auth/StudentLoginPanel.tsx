'use client';

import { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';

/**
 * 아이 로그인 칸 — **학교 · 학년 · 반 · 이름 · 비밀번호**.
 *
 * **칸을 늘어놓지 않는다.** 처음엔 학교·학년·반을 모두 버튼으로 폈는데,
 * 학교가 쉰 곳이 되고 한 학년에 열 반이 되면 그게 그대로 벽이 된다.
 * 학교는 **쳐서 좁히고**, 학년·반은 **정해진 펼침목록**이다 —
 * 학년은 어차피 여섯, 반은 열 몇이라 목록이 늘어날 일이 없다.
 *
 * **없는 반을 골라도 괜찮다.** 서버가 "이 반은 아직 학생 로그인을 열지 않았어요"
 * 라고 답한다. 그래서 반 목록을 만들려고 학교의 반을 통째로 읽지 않는다 —
 * 로그인하려는 아이마다 그 학교 반을 다 읽으면 그게 다 요금이다.
 *
 * **이름을 목록에서 고르게 하지 않았다.** 그러려면 명부를 내려줘야 하는데,
 * 그건 로그인도 안 한 사람에게 반 아이들 이름을 전부 보여주는 일이다.
 */

/** 학년은 여섯이 전부다 */
const GRADES = [1, 2, 3, 4, 5, 6];
/** 반은 넉넉히 열둘까지 — 반 만들기(`/api/class`)의 상한과 같다 */
const CLASS_NUMBERS = Array.from({ length: 12 }, (_, i) => i + 1);

export default function StudentLoginPanel({ onDone }: { onDone: () => void }) {
  const { signInAsStudent } = useAuth();
  const [schools, setSchools] = useState<{ id: string; name: string }[]>([]);
  /** 고른 학교. 고르기 전에는 비어 있다. */
  const [school, setSchool] = useState<{ id: string; name: string } | null>(null);
  /** 학교 이름 검색어 */
  const [term, setTerm] = useState('');
  const [grade, setGrade] = useState('');
  const [classNo, setClassNo] = useState('');
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
  const picked = school ?? (schools.length === 1 ? schools[0] : null);

  /** 친 글자로 좁힌다. 다 보여주면 학교가 많아질수록 목록이 벽이 된다. */
  const matches = term.trim()
    ? schools.filter((s) => s.name.replace(/\s+/g, '').includes(term.replace(/\s+/g, ''))).slice(0, 6)
    : [];

  const classId = grade && classNo ? `${grade}-${classNo}` : '';
  const ready = !!picked && !!classId && !!name.trim() && !!password.trim();

  const submit = async () => {
    if (!ready || !picked) return;
    setBusy(true); setErr('');
    try {
      await signInAsStudent({ schoolId: picked.id, classId, name, password });
      onDone();
    } catch (e) {
      setErr((e as Error).message || '들어가지 못했어요');
    } finally {
      // 성공하든 실패하든 반드시 푼다 — 없으면 버튼이 잠긴 채로 남는다
      setBusy(false);
    }
  };

  const fieldStyle = {
    background: 'rgba(255,255,255,0.95)',
    color: 'var(--color-text-main)',
  };
  const label = (t: string) => (
    <div className="text-[13px] font-bold mb-1.5" style={{ color: 'var(--color-text-sub)' }}>{t}</div>
  );

  return (
    <div className="w-full max-w-[340px]">
      {/* ---- 학교 ---- */}
      {label('학교')}
      {picked && schools.length > 1 ? (
        <button
          onClick={() => { setSchool(null); setTerm(''); }}
          className="w-full flex items-center gap-2 rounded-xl px-3.5 py-3 text-[15px] font-bold mb-3 text-left"
          style={{ background: 'var(--color-primary)', color: 'white' }}
        >
          🏫 <span className="flex-1 min-w-0 truncate">{picked.name}</span>
          <span className="text-[12px] opacity-80 shrink-0">바꾸기</span>
        </button>
      ) : picked ? (
        <div
          className="rounded-xl px-3.5 py-3 text-[15px] font-bold mb-3"
          style={{ background: 'var(--color-primary)', color: 'white' }}
        >
          🏫 {picked.name}
        </div>
      ) : (
        <>
          <input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="학교 이름을 쳐보세요 (예: 애월)"
            autoComplete="off"
            className="w-full rounded-xl px-3.5 py-3 text-[15px] outline-none"
            style={fieldStyle}
          />
          {matches.length > 0 && (
            <div className="mt-1.5 mb-3 flex flex-col gap-1">
              {matches.map((s) => (
                <button
                  key={s.id}
                  onClick={() => { setSchool(s); setTerm(''); }}
                  className="rounded-xl px-3.5 py-2.5 text-[14px] font-bold text-left"
                  style={{ background: 'rgba(255,255,255,0.9)', color: 'var(--color-text-sub)' }}
                >
                  🏫 {s.name}
                </button>
              ))}
            </div>
          )}
          {term.trim() && matches.length === 0 && (
            <p className="mt-1.5 mb-3 text-[12px]" style={{ color: 'var(--color-text-sub)' }}>
              그런 학교를 못 찾았어요. 선생님께 물어보세요.
            </p>
          )}
        </>
      )}

      {/* ---- 학년 · 반 ---- */}
      {picked && (
        <>
          <div className="flex gap-2 mb-3">
            <div className="flex-1 min-w-0">
              {label('학년')}
              <select
                value={grade}
                onChange={(e) => setGrade(e.target.value)}
                className="w-full rounded-xl px-3 py-3 text-[15px] outline-none"
                style={fieldStyle}
              >
                <option value="">고르기</option>
                {GRADES.map((g) => <option key={g} value={g}>{g}학년</option>)}
              </select>
            </div>
            <div className="flex-1 min-w-0">
              {label('반')}
              <select
                value={classNo}
                onChange={(e) => setClassNo(e.target.value)}
                className="w-full rounded-xl px-3 py-3 text-[15px] outline-none"
                style={fieldStyle}
              >
                <option value="">고르기</option>
                {CLASS_NUMBERS.map((n) => <option key={n} value={n}>{n}반</option>)}
              </select>
            </div>
          </div>

          {/* ---- 이름 · 비밀번호 ---- */}
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="내 이름"
            autoComplete="off"
            className="w-full rounded-xl px-3.5 py-3 text-[15px] outline-none mb-2"
            style={fieldStyle}
          />
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
            placeholder="우리 반 비밀번호"
            type="password"
            autoComplete="off"
            className="w-full rounded-xl px-3.5 py-3 text-[15px] outline-none mb-2"
            style={fieldStyle}
          />
          <p className="text-[12px] mb-3 leading-relaxed" style={{ color: 'var(--color-text-sub)' }}>
            비밀번호는 <b>우리 반 모두 같아요.</b> 선생님이 알려주신 것을 넣으세요.
            이름이 같은 친구가 있으면 <b>이름 뒤에 A·B</b>를 붙여요.
          </p>

          <button
            onClick={submit}
            disabled={busy || !ready}
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
