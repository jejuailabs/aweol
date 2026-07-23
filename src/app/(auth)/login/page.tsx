'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import StudentLoginPanel from '@/components/auth/StudentLoginPanel';

function LoginInner() {
  const { user, role, loading, signInWithGoogle } = useAuth();
  /**
   * 아이용 칸을 펼쳤나.
   *
   * **아이를 기본으로 두지 않았다.** 이 화면에 오는 사람의 대부분은 선생님·학부모이고,
   * 아이는 선생님이 "학생 로그인 눌러" 라고 한마디 하면 찾는다.
   */
  const [asStudent, setAsStudent] = useState(false);
  const router = useRouter();
  // 보던 화면으로 돌려보낸다. 한라산에서 로그인했는데 지도로 튕기면 길을 잃는다.
  const back = useSearchParams().get('from') || '/';

  useEffect(() => {
    if (loading) return;
    if (user && role) {
      router.replace(back);
    } else if (user && !role) {
      router.replace(`/join-request?from=${encodeURIComponent(back)}`);
    }
  }, [user, role, loading, router, back]);

  if (loading) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--color-primary)] border-t-transparent" />
      </div>
    );
  }

  return (
    <div
      className="flex h-dvh flex-col items-center justify-center px-6"
      style={{ background: 'linear-gradient(180deg, var(--color-sky) 0%, #FFFFFF 100%)' }}
    >
      <div className="mb-8 text-center">
        <div className="text-6xl mb-4">🏫</div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text-main)' }}>
          우리 동네 전시 지도
        </h1>
        <p className="mt-2 text-sm" style={{ color: 'var(--color-text-sub)' }}>
          우리 반의 작품을 만나러 가요!
        </p>
      </div>

      {asStudent ? (
        <>
          <StudentLoginPanel onDone={() => router.replace(back)} />
          <button
            onClick={() => setAsStudent(false)}
            className="mt-5 text-[13px] underline"
            style={{ color: 'var(--color-text-sub)' }}
          >
            선생님·학부모로 로그인하기
          </button>
        </>
      ) : (
      <>
      <button
        onClick={() => setAsStudent(true)}
        className="mb-3 flex items-center gap-2 rounded-full px-8 py-3 font-bold shadow-lg transition-transform hover:scale-105 active:scale-95"
        style={{ background: 'var(--color-primary)', color: 'white' }}
      >
        🎒 학생 로그인
      </button>
      <button
        onClick={signInWithGoogle}
        className="flex items-center gap-3 rounded-full bg-white px-8 py-3 font-medium shadow-lg transition-transform hover:scale-105 active:scale-95"
        style={{ color: 'var(--color-text-main)' }}
      >
        <svg width="20" height="20" viewBox="0 0 48 48">
          <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.9 33.1 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 5.7 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.9z" />
          <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.3 15.5 18.8 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 5.7 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
          <path fill="#4CAF50" d="M24 44c5.2 0 9.9-1.6 13.5-4.5l-6.2-5.3C29.3 35.8 26.7 36.8 24 36.8c-5.3 0-9.8-3.4-11.4-8.1l-6.5 5C9.5 39.6 16.2 44 24 44z" />
          <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4 5.5l6.2 5.3C36.9 39.3 44 34 44 24c0-1.3-.1-2.7-.4-3.9z" />
        </svg>
        Google로 로그인
      </button>
      <p className="mt-4 text-[13px] text-center" style={{ color: 'var(--color-text-sub)' }}>
        아이는 <b>학생 로그인</b>으로 들어가요.<br />
        이름과 우리 반 비밀번호만 있으면 돼요.
      </p>
      </>
      )}
    </div>
  );
}

/** useSearchParams 는 Suspense 안에서만 쓸 수 있다 */
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}
