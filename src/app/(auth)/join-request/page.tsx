'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { collection, getDocs } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { UserRole } from '@/lib/firestore-schema';

export default function JoinRequestPage() {
  const { user, userDoc } = useAuth();
  const router = useRouter();
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);
  /**
   * 학교 사람인가, 아닌가 — **먼저 이것부터 묻는다.**
   *
   * 예전에는 첫 화면에 학생·선생님·학교관리자·학부모 넷이 바로 나왔다.
   * 학교와 상관없이 전시관만 열러 온 사람은 **고를 것이 하나도 없었다.**
   * 넷 중 뭘 골라도 거짓이고, 학교를 고르라는 칸에서 막힌다.
   *
   * 그래서 두 갈래를 먼저 보여준다. 학교 사람이면 넷으로 다시 갈리고,
   * 아니면 그대로 들어간다.
   */
  const [track, setTrack] = useState<'school' | 'general' | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [schools, setSchools] = useState<{ id: string; name: string }[]>([]);
  const [schoolId, setSchoolId] = useState('');
  const [grade, setGrade] = useState('');
  const [classNumber, setClassNumber] = useState('');

  // 교사는 소속 학교를 밝혀야 한다 — 권한이 그 학교 안에서만 통한다
  useEffect(() => {
    if (!db) return;
    getDocs(collection(db, 'schools'))
      .then((snap) => setSchools(snap.docs.map((d) => ({ id: d.id, name: d.data().name || d.id }))))
      .catch(() => setSchools([]));
  }, []);

  const waiting = userDoc?.pendingRole === 'teacher' || userDoc?.pendingRole === 'school_admin';
  /** 학교관리자는 담임이 아닐 수 있어서 학년·반을 묻지 않는다 */
  const needsSchool = selectedRole === 'teacher' || selectedRole === 'school_admin';
  const needsClass = selectedRole === 'teacher';

  useEffect(() => {
    if (!user) {
      router.replace('/login');
    } else if (userDoc?.role) {
      router.replace('/');
    }
  }, [user, userDoc, router]);

  if (!user || userDoc?.role) {
    return null;
  }

  // 승인 대기 — 슈퍼관리자가 확인해줄 때까지는 아무 권한도 없다
  if (waiting) {
    return (
      <div
        className="flex min-h-dvh flex-col items-center justify-center px-6 text-center"
        style={{ background: 'linear-gradient(180deg, var(--color-sky) 0%, #FFFFFF 100%)' }}
      >
        <div className="text-6xl mb-4">⏳</div>
        <h1 className="text-lg font-bold mb-2" style={{ color: 'var(--color-text-main)' }}>
          확인을 기다리는 중이에요
        </h1>
        <p className="text-sm max-w-[320px] leading-relaxed mb-8" style={{ color: 'var(--color-text-sub)' }}>
          {userDoc?.pendingRole === 'school_admin'
            ? '학교 전체를 다루는 권한이라 총관리자가 한 번 확인해요.'
            : '아이들 명부를 다루는 권한이라 학교관리자가 한 번 확인해요.'}
          {' '}승인되면 바로 선생님 화면이 열립니다.
        </p>
        <button
          onClick={() => router.replace('/')}
          className="rounded-full px-8 py-3 font-bold text-white shadow-lg"
          style={{ background: 'var(--color-primary)' }}
        >
          그동안 구경하기
        </button>
      </div>
    );
  }

  /**
   * 첫 갈림길.
   *
   * 글자를 짧게 두고 아래에 한 줄로 풀어 썼다. '학교 관계자' 라는 말만 있으면
   * 학부모가 자기 얘기인지 아닌지 모른다 — 괄호로 누구를 말하는지 적어 둔다.
   */
  const tracks: { value: 'school' | 'general'; label: string; icon: string; desc: string }[] = [
    { value: 'school', label: '학교에서 왔어요', icon: '🏫', desc: '학생 · 선생님 · 학교관리자 · 학부모' },
    { value: 'general', label: '학교와 상관없어요', icon: '🎨', desc: '내 전시관을 열고, 전시를 보러 왔어요' },
  ];

  const roles: { value: UserRole; label: string; icon: string; desc: string }[] = [
    // 반 만들기는 여기서 빠졌다 — 학교관리자 몫이다. 적어두지 않으면
    // 선생님이 반부터 만들려다 막히고 나서야 알게 된다.
    { value: 'teacher', label: '선생님', icon: '👩‍🏫', desc: '우리 반 수업(활동)·숙제·작품 승인' },
    { value: 'school_admin', label: '학교관리자', icon: '🏫', desc: '반 만들기, 우리 학교 선생님 승인' },
    { value: 'student', label: '학생', icon: '🎒', desc: '내 반에 작품 올리기, 감상평 쓰기' },
    { value: 'parent', label: '학부모', icon: '👨‍👩‍👧', desc: '아이 작품 관람, 감상평 쓰기' },
  ];

  /**
   * 역할은 서버가 정한다. 학생·학부모는 바로 부여되고, 교사는 접수만 되어 승인을 기다린다.
   * (서버가 코드를 처리할 때 역할을 보고 학생/학부모 연결을 나누므로 순서가 중요하다)
   */
  const handleRoleNext = async () => {
    if (!selectedRole || !user) return;
    setLoading(true);
    setError('');
    try {
      const token = await auth?.currentUser?.getIdToken();
      const res = await fetch('/api/role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ role: selectedRole, schoolId, grade: Number(grade), classNumber: Number(classNumber) }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || '처리하지 못했어요');
        return;
      }
      // 교사는 승인 대기 화면으로 (userDoc 구독이 pendingRole 을 받아 알아서 바뀐다)
      // 그 밖에는 **서버가 정해준 곳으로** 간다 — 학생·학부모는 코드 화면,
      // 일반은 넣을 코드가 없으니 곧장 지도로.
      if (!json.pending) router.replace(json.next || '/join-class');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="flex min-h-dvh flex-col items-center justify-center px-6"
      style={{ background: 'linear-gradient(180deg, var(--color-sky) 0%, #FFFFFF 100%)' }}
    >
      <>
          <h1 className="text-xl font-bold mb-2" style={{ color: 'var(--color-text-main)' }}>
            반가워요, {user.displayName}!
          </h1>
          <p className="text-sm mb-8" style={{ color: 'var(--color-text-sub)' }}>
            {track === 'school' ? '어떤 역할로 참여하시나요?' : '어디에서 오셨나요?'}
          </p>

          {track === null && (
            <div className="flex flex-col gap-3 w-full max-w-[320px]">
              {tracks.map((t) => (
                <button
                  key={t.value}
                  onClick={() => {
                    setTrack(t.value);
                    // 일반은 여기서 역할이 정해진다 — 더 물을 것이 없다
                    setSelectedRole(t.value === 'general' ? 'general' : null);
                    setError('');
                  }}
                  className="flex items-center gap-4 rounded-2xl p-5 text-left shadow-sm transition-transform hover:scale-[1.02] active:scale-95"
                  style={{ background: 'rgba(255,255,255,0.85)', border: '2px solid transparent' }}
                >
                  <span className="text-3xl">{t.icon}</span>
                  <div>
                    <div className="font-bold text-[15px]" style={{ color: 'var(--color-text-main)' }}>{t.label}</div>
                    <div className="text-[13px] mt-0.5" style={{ color: 'var(--color-text-sub)' }}>{t.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {track === 'general' && (
            <div
              className="w-full max-w-[320px] rounded-2xl px-5 py-4 text-[13px] leading-relaxed"
              style={{ background: 'rgba(255,255,255,0.85)', color: 'var(--color-text-sub)' }}
            >
              <div className="font-bold text-[15px] mb-1.5" style={{ color: 'var(--color-text-main)' }}>
                🎨 바로 시작할 수 있어요
              </div>
              기다릴 것도, 받아야 할 코드도 없어요.<br />
              지도 위에 <b>내 전시관</b>을 열고, 전시를 만들어 작품을 걸 수 있어요.
              다른 사람의 전시도 둘러보고 감상평을 남길 수 있고요.
              <div className="mt-2 pt-2" style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                학교 반이나 숙제 같은 <b>학교 안 기능은 들어 있지 않아요.</b>
              </div>
            </div>
          )}

          {track === 'school' && (
          <div className="flex flex-col gap-3 w-full max-w-[320px]">
            {roles.map((r) => (
              <button
                key={r.value}
                onClick={() => setSelectedRole(r.value)}
                className="flex items-center gap-4 rounded-2xl p-4 text-left transition-all shadow-sm"
                style={{
                  background: selectedRole === r.value ? 'var(--color-surface)' : 'rgba(255,255,255,0.8)',
                  border: selectedRole === r.value ? '3px solid var(--color-primary)' : '2px solid transparent',
                  transform: selectedRole === r.value ? 'scale(1.03)' : 'scale(1)',
                }}
              >
                <span className="text-3xl">{r.icon}</span>
                <div>
                  <div className="font-bold text-sm" style={{ color: 'var(--color-text-main)' }}>{r.label}</div>
                  <div className="text-sm" style={{ color: 'var(--color-text-sub)' }}>{r.desc}</div>
                </div>
              </button>
            ))}
          </div>
          )}

          {needsSchool && (
            <div className="mt-4 w-full max-w-[320px]">
              <div className="text-[13px] font-bold mb-1.5" style={{ color: 'var(--color-text-sub)' }}>
                어느 학교 선생님이신가요?
              </div>
              <div className="flex flex-col gap-1.5 mb-3">
                {schools.length === 0 ? (
                  <div className="rounded-xl px-4 py-3 text-[13px]" style={{ background: 'rgba(255,255,255,0.85)', color: 'var(--color-text-sub)' }}>
                    아직 등록된 학교가 없어요. 총관리자에게 문의해 주세요.
                  </div>
                ) : (
                  schools.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setSchoolId(s.id)}
                      className="rounded-xl px-4 py-2.5 text-[14px] font-bold text-left"
                      style={{
                        background: schoolId === s.id ? 'var(--color-primary)' : 'rgba(255,255,255,0.85)',
                        color: schoolId === s.id ? 'white' : 'var(--color-text-sub)',
                      }}
                    >
                      {s.name}
                    </button>
                  ))
                )}
              </div>
              {needsClass && (
                <>
                  <div className="text-[13px] font-bold mb-1.5" style={{ color: 'var(--color-text-sub)' }}>
                    맡으신 학년과 반
                  </div>
                  <div className="flex gap-2 mb-3">
                    <input
                      type="number" min={1} max={6} value={grade}
                      onChange={(e) => setGrade(e.target.value)}
                      placeholder="학년"
                      className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                      style={{ background: 'rgba(255,255,255,0.9)', color: 'var(--color-text-main)' }}
                    />
                    <input
                      type="number" min={1} max={20} value={classNumber}
                      onChange={(e) => setClassNumber(e.target.value)}
                      placeholder="반"
                      className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                      style={{ background: 'rgba(255,255,255,0.9)', color: 'var(--color-text-main)' }}
                    />
                  </div>
                </>
              )}
              <div
                className="rounded-xl px-4 py-3 text-[13px] leading-relaxed"
                style={{ background: 'rgba(255,255,255,0.85)', color: 'var(--color-text-sub)' }}
              >
                {selectedRole === 'school_admin' ? (
                  <>
                    ⏳ 학교관리자는 <b>총관리자 확인</b>을 거쳐요.
                    우리 학교의 <b>반을 만들고</b>, 선생님 신청을 <b>승인</b>합니다.
                    권한은 <b>이 학교 안에서만</b> 통해요.
                  </>
                ) : (
                  <>
                    ⏳ 선생님은 아이들 명부를 다루기 때문에 <b>학교관리자 확인</b>을 거쳐요.
                    권한은 <b>맡으신 반 안에서만</b> 쓸 수 있어요 — 같은 학교라도 다른 반은
                    보거나 고칠 수 없습니다. 반이 아직 없으면 학교관리자에게 요청해 주세요.
                  </>
                )}
              </div>
            </div>
          )}

          {(selectedRole === 'student' || selectedRole === 'parent') && (
            <div
              className="mt-4 w-full max-w-[320px] rounded-xl px-4 py-3 text-[13px] leading-relaxed"
              style={{ background: 'rgba(255,255,255,0.85)', color: 'var(--color-text-sub)' }}
            >
              🔑 다음 화면에서 선생님께 받은 <b>6자리 코드</b>를 넣으면
              {selectedRole === 'parent' ? ' 자녀와 연결돼요.' : ' 우리 반으로 들어가요.'}
              {' '}코드가 없어도 구경은 할 수 있어요.
            </div>
          )}

          {/* 첫 화면에는 단추를 두지 않는다 — 카드를 누르는 것이 곧 '다음' 이다 */}
          {track !== null && (
            <button
              onClick={handleRoleNext}
              disabled={
                !selectedRole || loading ||
                (needsSchool && !schoolId) ||
                (needsClass && (!grade || !classNumber))
              }
              className="mt-8 rounded-full px-8 py-3 font-bold text-white shadow-lg transition-transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:scale-100"
              style={{ background: 'var(--color-primary)' }}
            >
              {loading ? '처리 중...'
                : selectedRole === 'teacher' ? '선생님으로 신청하기'
                : selectedRole === 'school_admin' ? '학교관리자로 신청하기'
                : selectedRole === 'general' ? '바로 시작하기'
                : '다음으로'}
            </button>
          )}

          {/*
            되돌아갈 길 — **없으면 갇힌다.**
            학교를 골랐는데 우리 학교가 목록에 없으면, 여기서 나갈 방법이
            새로고침밖에 없다.
          */}
          {track !== null && (
            <button
              onClick={() => { setTrack(null); setSelectedRole(null); setError(''); }}
              className="mt-4 text-[13px] underline"
              style={{ color: 'var(--color-text-sub)' }}
            >
              처음으로 돌아가기
            </button>
          )}

          {error && (
            <div className="mt-3 text-[14px] font-bold" style={{ color: '#C0392B' }}>{error}</div>
          )}
      </>
    </div>
  );
}
