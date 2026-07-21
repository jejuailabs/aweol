'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';

const ROLE_LABEL: Record<string, string> = {
  super_admin: '총관리자',
  teacher: '교사',
  student: '학생',
  parent: '학부모',
};

export default function SettingsPage() {
  const router = useRouter();
  const { user, userDoc, role, signOut, signInWithGoogle } = useAuth();
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const saved = (localStorage.getItem('theme') as 'light' | 'dark') || 'light';
    setTheme(saved);
  }, []);

  const toggleTheme = async () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    localStorage.setItem('theme', next);
    document.documentElement.dataset.theme = next;
    if (user && db) {
      try {
        await updateDoc(doc(db, 'users', user.uid), { 'preferences.theme': next });
      } catch {}
    }
  };

  const handleSignOut = async () => {
    await signOut();
    router.push('/');
  };

  return (
    <div className="px-4 pt-8 pb-24 mx-auto max-w-[600px]">
      <h1 className="text-xl font-bold mb-6" style={{ color: 'var(--color-text-main)' }}>⚙️ 설정</h1>

      {/* 계정 */}
      <h2 className="text-sm font-bold mb-2" style={{ color: 'var(--color-text-sub)' }}>계정</h2>
      <div className="rounded-2xl overflow-hidden shadow-md mb-6" style={{ background: 'var(--color-surface)' }}>
        {user ? (
          <>
            <div className="flex items-center gap-3 p-4 border-b" style={{ borderColor: 'var(--color-surface-soft)' }}>
              {userDoc?.photoURL ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={userDoc.photoURL} alt="" className="h-10 w-10 rounded-full" />
              ) : (
                <div className="h-10 w-10 rounded-full flex items-center justify-center text-xl" style={{ background: 'var(--color-surface-soft)' }}>🙂</div>
              )}
              <div>
                <div className="text-sm font-bold" style={{ color: 'var(--color-text-main)' }}>{userDoc?.displayName}</div>
                <div className="text-[12px]" style={{ color: 'var(--color-text-sub)' }}>
                  {role ? ROLE_LABEL[role] : '역할 미지정'}
                </div>
              </div>
            </div>
            <button
              onClick={() => router.push('/avatar-select')}
              className="w-full p-4 text-left text-sm border-b flex items-center justify-between"
              style={{ borderColor: 'var(--color-surface-soft)', color: 'var(--color-text-main)' }}
            >
              <span>🎭 아바타 변경</span><span style={{ color: 'var(--color-text-sub)' }}>›</span>
            </button>
            <button
              onClick={handleSignOut}
              className="w-full p-4 text-left text-sm"
              style={{ color: '#E74C3C' }}
            >
              로그아웃
            </button>
          </>
        ) : (
          <button onClick={signInWithGoogle} className="w-full p-4 text-left text-sm font-bold" style={{ color: 'var(--color-primary)' }}>
            Google로 로그인
          </button>
        )}
      </div>

      {/* 화면 */}
      <h2 className="text-sm font-bold mb-2" style={{ color: 'var(--color-text-sub)' }}>화면</h2>
      <div className="rounded-2xl overflow-hidden shadow-md mb-6" style={{ background: 'var(--color-surface)' }}>
        <button
          onClick={toggleTheme}
          className="w-full p-4 flex items-center justify-between text-sm"
          style={{ color: 'var(--color-text-main)' }}
        >
          <span>{theme === 'dark' ? '🌙 다크 모드' : '☀️ 라이트 모드'}</span>
          <span
            className="relative inline-block h-6 w-11 rounded-full transition-colors"
            style={{ background: theme === 'dark' ? 'var(--color-primary)' : '#D1D5DB' }}
          >
            <span
              className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all"
              style={{ left: theme === 'dark' ? '22px' : '2px' }}
            />
          </span>
        </button>
      </div>

      {/* 정보 */}
      <h2 className="text-sm font-bold mb-2" style={{ color: 'var(--color-text-sub)' }}>정보</h2>
      <div className="rounded-2xl overflow-hidden shadow-md" style={{ background: 'var(--color-surface)' }}>
        <div className="p-4 text-sm flex items-center justify-between" style={{ color: 'var(--color-text-main)' }}>
          <span>버전</span>
          <span style={{ color: 'var(--color-text-sub)' }}>1.0.0</span>
        </div>
        <div className="p-4 pt-0 text-[12px] leading-relaxed" style={{ color: 'var(--color-text-sub)' }}>
          애월초 학급 전시실 — 우리 반 친구들의 작품을 3D 전시실에서 만나보세요.
        </div>
      </div>
    </div>
  );
}
