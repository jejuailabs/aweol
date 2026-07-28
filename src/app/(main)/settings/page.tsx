'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { isMuted, setMuted, playSound } from '@/lib/sound';
import { BRAND, BRAND_TAGLINE } from '@/lib/brand';

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
  /**
   * 소리 꺼짐인가.
   *
   * **처음에는 늘 '켜짐'으로 그린다.** 서버에서 그린 것과 브라우저에서 그린 것이
   * 다르면 React 가 어긋난다고 나무란다(localStorage 는 서버에 없다).
   * 실제 값은 아래 효과에서 맞춘다.
   */
  const [soundOff, setSoundOff] = useState(false);

  useEffect(() => {
    const saved = (localStorage.getItem('theme') as 'light' | 'dark') || 'light';
    setTheme(saved);
    setSoundOff(isMuted());
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

      {/*
        소리 — **끌 수 있어야 한다.**

        음소거 값은 예전부터 있었는데 **켜고 끄는 자리가 어디에도 없었다.**
        짧은 효과음만 있을 때는 넘어갔지만, 마을에 파도·바람이 계속 흐르게 된
        지금은 다르다 — 교실에서 스물다섯 명이 한꺼번에 틀면 수업이 안 된다.
      */}
      <h2 className="text-sm font-bold mb-2" style={{ color: 'var(--color-text-sub)' }}>소리</h2>
      <div className="rounded-2xl overflow-hidden shadow-md mb-6" style={{ background: 'var(--color-surface)' }}>
        <button
          onClick={() => {
            const next = !soundOff;
            setSoundOff(next);
            setMuted(next);
            // 켠 티를 소리로 낸다 — 껐을 때는 당연히 아무 소리도 안 난다
            if (!next) playSound('tap');
          }}
          className="w-full p-4 text-left text-sm flex items-center justify-between"
          style={{ color: 'var(--color-text-main)' }}
        >
          <span className="min-w-0 pr-3">
            {soundOff ? '🔇 소리 꺼짐' : '🔊 소리 켜짐'}
            <span className="block text-[12px] mt-0.5" style={{ color: 'var(--color-text-sub)' }}>
              버튼 소리, 마을의 파도·바람·새소리, 전시실 음악
            </span>
          </span>
          {/* 켜짐/꺼짐이 한눈에 보이는 스위치 */}
          <span
            className="shrink-0 rounded-full transition-colors"
            style={{
              width: 46, height: 28, padding: 3,
              background: soundOff ? 'var(--color-surface-soft)' : 'var(--color-primary)',
              display: 'inline-block',
            }}
          >
            <span
              className="block rounded-full transition-transform"
              style={{
                width: 22, height: 22, background: 'white',
                transform: soundOff ? 'translateX(0)' : 'translateX(18px)',
              }}
            />
          </span>
        </button>
      </div>

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
          {BRAND} — {BRAND_TAGLINE}
        </div>
      </div>
    </div>
  );
}
