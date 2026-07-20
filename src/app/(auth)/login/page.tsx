'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

export default function LoginPage() {
  const { user, role, loading, signInWithGoogle } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (user && role) {
      router.replace('/');
    } else if (user && !role) {
      router.replace('/join-request');
    }
  }, [user, role, loading, router]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--color-primary)] border-t-transparent" />
      </div>
    );
  }

  return (
    <div
      className="flex h-screen flex-col items-center justify-center px-6"
      style={{ background: 'linear-gradient(180deg, var(--color-sky) 0%, #FFFFFF 100%)' }}
    >
      <div className="mb-8 text-center">
        <div className="text-6xl mb-4">🏫</div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text-main)' }}>
          애월초 학급 전시실
        </h1>
        <p className="mt-2 text-sm" style={{ color: 'var(--color-text-sub)' }}>
          우리 반의 작품을 만나러 가요!
        </p>
      </div>

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
    </div>
  );
}
