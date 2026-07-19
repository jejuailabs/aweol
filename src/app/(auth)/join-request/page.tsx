'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { UserRole } from '@/lib/firestore-schema';

export default function JoinRequestPage() {
  const { user, userDoc } = useAuth();
  const router = useRouter();
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) {
      router.replace('/login');
    } else if (userDoc?.role) {
      router.replace('/school');
    }
  }, [user, userDoc, router]);

  if (!user || userDoc?.role) {
    return null;
  }

  const roles: { value: UserRole; label: string; icon: string; desc: string }[] = [
    { value: 'super_admin', label: '교사', icon: '👩‍🏫', desc: '학급 관리, 학생 등록, 작품 승인' },
    { value: 'student', label: '학생', icon: '🎒', desc: '작품 업로드, 댓글 작성' },
    { value: 'parent', label: '학부모', icon: '👨‍👩‍👧', desc: '자녀 작품 열람, 댓글 작성' },
  ];

  const handleSubmit = async () => {
    if (!selectedRole || !user || !db) return;
    setLoading(true);
    await updateDoc(doc(db, 'users', user.uid), { role: selectedRole });
    router.replace('/avatar-select');
  };

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center px-6"
      style={{ background: 'linear-gradient(180deg, var(--color-sky) 0%, #FFFFFF 100%)' }}
    >
      <h1 className="text-xl font-bold mb-2" style={{ color: 'var(--color-text-main)' }}>
        반가워요, {user.displayName}!
      </h1>
      <p className="text-sm mb-8" style={{ color: 'var(--color-text-sub)' }}>
        어떤 역할로 참여하시나요?
      </p>

      <div className="flex flex-col gap-3 w-full max-w-[320px]">
        {roles.map((r) => (
          <button
            key={r.value}
            onClick={() => setSelectedRole(r.value)}
            className="flex items-center gap-4 rounded-2xl p-4 text-left transition-all shadow-sm"
            style={{
              background: selectedRole === r.value ? 'var(--color-surface)' : 'rgba(255,255,255,0.8)',
              border: selectedRole === r.value ? '3px solid var(--color-primary)' : '2px solid transparent',
            }}
          >
            <span className="text-3xl">{r.icon}</span>
            <div>
              <div className="font-bold text-sm" style={{ color: 'var(--color-text-main)' }}>{r.label}</div>
              <div className="text-xs" style={{ color: 'var(--color-text-sub)' }}>{r.desc}</div>
            </div>
          </button>
        ))}
      </div>

      <button
        onClick={handleSubmit}
        disabled={!selectedRole || loading}
        className="mt-8 rounded-full px-8 py-3 font-bold text-white shadow-lg transition-transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:scale-100"
        style={{ background: 'var(--color-primary)' }}
      >
        {loading ? '처리 중...' : '다음으로'}
      </button>
    </div>
  );
}
