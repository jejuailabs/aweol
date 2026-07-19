'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { AvatarId } from '@/lib/firestore-schema';
import Mascot from '@/components/mascot/Mascot';

const avatarPresets: { id: AvatarId; label: string; emoji: string; desc: string }[] = [
  { id: 'avatar_01', label: '교복 소년', emoji: '👦', desc: '기본 남학생' },
  { id: 'avatar_02', label: '교복 소녀', emoji: '👧', desc: '기본 여학생' },
  { id: 'avatar_03', label: '화가 소년', emoji: '🎨', desc: '베레모 + 붓' },
  { id: 'avatar_04', label: '화가 소녀', emoji: '🖌️', desc: '앞치마 + 팔레트' },
  { id: 'avatar_05', label: '탐험가', emoji: '🔍', desc: '모자 + 돋보기' },
  { id: 'avatar_06', label: '로봇 친구', emoji: '🤖', desc: '둥글둥글 미니 로봇' },
  { id: 'avatar_07', label: '고양이', emoji: '🐱', desc: '귀여운 고양이' },
  { id: 'avatar_08', label: '강아지', emoji: '🐶', desc: '귀여운 강아지' },
];

export default function AvatarSelectPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [selected, setSelected] = useState<AvatarId | null>(null);
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    if (!selected || !user || !db) return;
    setLoading(true);
    await updateDoc(doc(db, 'users', user.uid), { avatarId: selected });
    router.replace('/school');
  };

  return (
    <div
      className="flex min-h-screen flex-col items-center px-6 pt-12 pb-24"
      style={{ background: 'linear-gradient(180deg, var(--color-sky) 0%, #FFFFFF 100%)' }}
    >
      <Mascot message="나를 대신할 캐릭터를 골라줘!" />

      <h1 className="text-lg font-bold mb-6 mt-4" style={{ color: 'var(--color-text-main)' }}>
        아바타 선택
      </h1>

      {/* 프리셋 그리드 */}
      <div className="grid grid-cols-4 gap-3 w-full max-w-[360px] mb-8">
        {avatarPresets.map((avatar) => (
          <button
            key={avatar.id}
            onClick={() => setSelected(avatar.id)}
            className="flex flex-col items-center gap-1 rounded-2xl p-3 transition-all"
            style={{
              background: selected === avatar.id ? 'var(--color-surface)' : 'rgba(255,255,255,0.7)',
              border: selected === avatar.id ? '3px solid var(--color-primary)' : '2px solid transparent',
              transform: selected === avatar.id ? 'scale(1.08)' : 'scale(1)',
              boxShadow: selected === avatar.id ? '0 4px 12px rgba(62,196,109,0.3)' : '0 1px 4px rgba(0,0,0,0.08)',
            }}
          >
            <span className="text-4xl">{avatar.emoji}</span>
            <span className="text-[10px] font-medium" style={{ color: 'var(--color-text-main)' }}>
              {avatar.label}
            </span>
          </button>
        ))}
      </div>

      {/* 선택된 아바타 미리보기 */}
      {selected && (
        <div
          className="w-full max-w-[280px] rounded-3xl p-6 text-center shadow-lg mb-6"
          style={{ background: 'var(--color-surface)' }}
        >
          <div className="text-7xl mb-3">
            {avatarPresets.find((a) => a.id === selected)?.emoji}
          </div>
          <div className="font-bold" style={{ color: 'var(--color-text-main)' }}>
            {avatarPresets.find((a) => a.id === selected)?.label}
          </div>
          <div className="text-xs mt-1" style={{ color: 'var(--color-text-sub)' }}>
            {avatarPresets.find((a) => a.id === selected)?.desc}
          </div>
          <div className="mt-3 text-xs" style={{ color: 'var(--color-text-sub)' }}>
            🔄 3D 모델 미리보기는 곧 추가됩니다
          </div>
        </div>
      )}

      <button
        onClick={handleConfirm}
        disabled={!selected || loading}
        className="rounded-full px-8 py-3 font-bold text-white shadow-lg transition-transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:scale-100"
        style={{ background: 'var(--color-primary)' }}
      >
        {loading ? '저장 중...' : '이 친구로 할래!'}
      </button>
    </div>
  );
}
