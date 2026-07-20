'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { UserRole } from '@/lib/firestore-schema';

const ROLE_LABEL: Record<UserRole, string> = {
  super_admin: '총관리자',
  teacher: '선생님',
  student: '학생',
  parent: '학부모',
};

const ROLE_COLOR: Record<UserRole, string> = {
  super_admin: '#7B4B94',
  teacher: '#E8604C',
  student: '#3BAF9F',
  parent: '#4A90D9',
};

export default function ProfileMenu() {
  const router = useRouter();
  const { user, userDoc, role, actualRole, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // 바깥을 누르면 닫기
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
    };
  }, [open]);

  if (!user) {
    return (
      <button onClick={() => router.push('/login')} className="ac-btn px-4 py-2 text-xs">
        🔑 로그인
      </button>
    );
  }

  const name = userDoc?.displayName || '이름 없음';
  const initial = name[0] || '?';
  const shownRole = role ?? actualRole;

  const handleSignOut = async () => {
    setSigningOut(true);
    await signOut();
    setOpen(false);
    setSigningOut(false);
    router.push('/school');
  };

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-10 h-10 rounded-full overflow-hidden border-2 shadow-lg transition-transform hover:scale-105 active:scale-95"
        style={{ borderColor: 'var(--color-primary)' }}
        aria-label="내 프로필"
      >
        {userDoc?.photoURL ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={userDoc.photoURL} alt="" className="w-full h-full object-cover" />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center bg-white text-sm font-bold"
            style={{ color: 'var(--color-text-main)' }}
          >
            {initial}
          </div>
        )}
      </button>

      {open && (
        <div
          className="modal-card absolute right-0 mt-2 w-[220px] rounded-2xl overflow-hidden shadow-2xl"
          style={{ background: 'var(--color-surface)', border: '2px solid var(--color-surface-soft)' }}
        >
          {/* 프로필 */}
          <div className="px-4 py-3.5" style={{ background: 'var(--color-surface-soft)' }}>
            <div className="text-sm font-bold truncate" style={{ color: 'var(--color-text-main)' }}>
              {name}
            </div>
            {shownRole && (
              <span
                className="inline-block mt-1 rounded-full px-2 py-0.5 text-[9px] font-bold text-white"
                style={{ background: ROLE_COLOR[shownRole] }}
              >
                {ROLE_LABEL[shownRole]}
                {role !== actualRole && ' (테스트 중)'}
              </span>
            )}
          </div>

          {/* 학생·학부모는 코드로 우리 반과 연결한다 */}
          {(shownRole === 'student' || shownRole === 'parent') && (
            <button
              onClick={() => { setOpen(false); router.push('/join-class'); }}
              className="w-full px-4 py-3 text-left text-sm flex items-center gap-2.5"
              style={{ color: 'var(--color-text-main)' }}
            >
              🔑 우리 반 코드 입력
            </button>
          )}
          <button
            onClick={() => { setOpen(false); router.push('/my-stand'); }}
            className="w-full px-4 py-3 text-left text-sm flex items-center gap-2.5"
            style={{ color: 'var(--color-text-main)', borderTop: '1px solid var(--color-surface-soft)' }}
          >
            ⭐ 내 스탠드
          </button>
          <button
            onClick={() => { setOpen(false); router.push('/avatar-select'); }}
            className="w-full px-4 py-3 text-left text-sm flex items-center gap-2.5"
            style={{ color: 'var(--color-text-main)', borderTop: '1px solid var(--color-surface-soft)' }}
          >
            🎭 아바타 변경
          </button>
          <button
            onClick={() => { setOpen(false); router.push('/settings'); }}
            className="w-full px-4 py-3 text-left text-sm flex items-center gap-2.5"
            style={{ color: 'var(--color-text-main)', borderTop: '1px solid var(--color-surface-soft)' }}
          >
            ⚙️ 설정
          </button>
          <button
            onClick={handleSignOut}
            disabled={signingOut}
            className="w-full px-4 py-3 text-left text-sm flex items-center gap-2.5 disabled:opacity-50"
            style={{ color: '#E8604C', borderTop: '1px solid var(--color-surface-soft)' }}
          >
            🚪 {signingOut ? '로그아웃 중...' : '로그아웃'}
          </button>
        </div>
      )}
    </div>
  );
}
