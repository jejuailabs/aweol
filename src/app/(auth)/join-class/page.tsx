'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { LEGACY_SCHOOL_ID } from '@/lib/paths';

const LEN = 6;

/** 학생·학부모가 선생님께 받은 코드를 입력해 우리 반과 연결하는 화면 */
export default function JoinClassPage() {
  const router = useRouter();
  const { user, userDoc, loading } = useAuth();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ name: string; classId: string; as: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const isParent = userDoc?.role === 'parent';

  const submit = async () => {
    if (code.length !== LEN) return;
    setBusy(true);
    setError('');
    const token = await auth?.currentUser?.getIdToken();
    const res = await fetch('/api/student-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ schoolId: LEGACY_SCHOOL_ID, code }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(json.error || '연결에 실패했어요');
      return;
    }
    setDone({ name: json.name, classId: json.classId, as: json.as });
  };

  if (loading) return null;

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center px-6"
      style={{ background: 'linear-gradient(180deg, var(--color-sky) 0%, #FFFFFF 100%)' }}
    >
      {done ? (
        <>
          <div className="text-6xl mb-3">🎉</div>
          <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--color-text-main)' }}>
            {done.as === 'parent' ? `${done.name} 학생과 연결됐어요!` : `${done.name}님, 환영해요!`}
          </h1>
          <p className="text-sm mb-8" style={{ color: 'var(--color-text-sub)' }}>
            {done.classId}반으로 들어갈 수 있어요
          </p>
          <button
            onClick={() => router.replace(userDoc?.avatarId ? `/school/${LEGACY_SCHOOL_ID}/class/${done.classId}/room` : '/avatar-select')}
            className="rounded-full px-8 py-3 font-bold text-white shadow-lg transition-transform hover:scale-105"
            style={{ background: 'var(--color-primary)' }}
          >
            {userDoc?.avatarId ? '우리 반 가기 🚪' : '내 캐릭터 고르러 가기 🎭'}
          </button>
        </>
      ) : (
        <>
          <div className="text-5xl mb-3">🔑</div>
          <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--color-text-main)' }}>
            우리 반 코드를 입력해요
          </h1>
          <p className="text-sm mb-7 text-center leading-relaxed" style={{ color: 'var(--color-text-sub)' }}>
            {isParent
              ? '자녀의 담임 선생님께 받은 6자리 코드를 넣어주세요'
              : '선생님께 받은 6자리 코드를 넣어주세요'}
          </p>

          <input
            ref={inputRef}
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, LEN));
              setError('');
            }}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
            placeholder="______"
            inputMode="text"
            autoCapitalize="characters"
            className="w-full max-w-[320px] rounded-2xl px-4 py-4 text-center outline-none mb-3"
            style={{
              background: 'white',
              color: 'var(--color-text-main)',
              fontSize: '30px',
              fontWeight: 800,
              letterSpacing: '0.35em',
              fontFamily: 'monospace',
              border: error ? '3px solid #E8604C' : '3px solid var(--color-primary)',
            }}
          />

          {error && (
            <div className="text-xs font-bold mb-3 text-center" style={{ color: '#E8604C' }}>
              {error}
            </div>
          )}

          <button
            onClick={submit}
            disabled={code.length !== LEN || busy}
            className="rounded-full px-8 py-3 font-bold text-white shadow-lg transition-transform hover:scale-105 disabled:opacity-40 disabled:scale-100"
            style={{ background: 'var(--color-primary)' }}
          >
            {busy ? '확인 중...' : '들어가기'}
          </button>

          <button
            onClick={() => router.replace('/')}
            className="mt-4 text-xs"
            style={{ color: 'var(--color-text-sub)' }}
          >
            나중에 할게요 (구경만 하기)
          </button>
        </>
      )}
    </div>
  );
}
