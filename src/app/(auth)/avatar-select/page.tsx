'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { AvatarId } from '@/lib/firestore-schema';
import { AVATAR_PRESETS, SHIRT_COLORS, HAIR_COLORS, type AvatarPreset } from '@/lib/avatar-presets';
import Mascot from '@/components/mascot/Mascot';

/**
 * 고른 아바타를 옷·머리 색까지 반영해서 보여준다.
 * 이모지만 보여주면 색을 바꿔도 화면이 그대로라 아이가 바뀐 줄 모른다.
 * 3D 실물과 똑같지는 않고, 어떤 색이 어디에 칠해지는지만 알려주는 그림이다.
 */
function AvatarPreview({ preset, shirt, hair }: { preset: AvatarPreset; shirt: string; hair: string }) {
  const hairColor = hair || preset.hair;
  const shirtColor = shirt || preset.shirt;

  return (
    <svg viewBox="0 0 100 120" width="128" height="154" aria-hidden>
      {/* 다리 */}
      <rect x="38" y="92" width="9" height="20" rx="4" fill="#3D6BB3" />
      <rect x="53" y="92" width="9" height="20" rx="4" fill="#3D6BB3" />
      {/* 몸 (옷) */}
      <rect x="30" y="62" width="40" height="34" rx="12" fill={shirtColor} stroke="rgba(0,0,0,0.12)" />
      {/* 팔 */}
      <rect x="21" y="64" width="10" height="24" rx="5" fill={shirtColor} stroke="rgba(0,0,0,0.12)" />
      <rect x="69" y="64" width="10" height="24" rx="5" fill={shirtColor} stroke="rgba(0,0,0,0.12)" />
      {/* 긴 머리는 얼굴 뒤로 어깨까지 */}
      {preset.longHair && <rect x="24" y="30" width="52" height="48" rx="24" fill={hairColor} />}
      {/* 귀 — 동물 캐릭터만 */}
      {preset.ears === 'cat' && (
        <>
          <polygon points="30,28 36,10 45,24" fill={hairColor} />
          <polygon points="70,28 64,10 55,24" fill={hairColor} />
        </>
      )}
      {preset.ears === 'dog' && (
        <>
          <ellipse cx="28" cy="36" rx="8" ry="14" fill={hairColor} />
          <ellipse cx="72" cy="36" rx="8" ry="14" fill={hairColor} />
        </>
      )}
      {/* 얼굴 */}
      <circle cx="50" cy="42" r="24" fill={preset.skin} />
      {/* 앞머리 — 동물은 안 그린다 (귀가 이미 머리색) */}
      {!preset.ears && <path d="M26 40 A24 24 0 0 1 74 40 L74 32 A24 24 0 0 0 26 32 Z" fill={hairColor} />}
      {/* 눈·볼 */}
      <circle cx="42" cy="45" r="3" fill="#3A2A1A" />
      <circle cx="58" cy="45" r="3" fill="#3A2A1A" />
      <circle cx="35" cy="52" r="3.5" fill="#FF9DA8" opacity="0.55" />
      <circle cx="65" cy="52" r="3.5" fill="#FF9DA8" opacity="0.55" />
      <path d="M45 54 Q50 58 55 54" stroke="#3A2A1A" strokeWidth="2" fill="none" strokeLinecap="round" />
    </svg>
  );
}

function ColorRow({
  title, colors, value, onPick,
}: { title: string; colors: string[]; value: string; onPick: (c: string) => void }) {
  return (
    <div className="w-full">
      <div className="text-sm font-bold mb-2" style={{ color: 'var(--color-text-sub)' }}>{title}</div>
      <div className="flex flex-wrap gap-2">
        {colors.map((c) => (
          <button
            key={c}
            onClick={() => onPick(c)}
            aria-label={`${title} ${c}`}
            className="rounded-full transition-transform active:scale-90"
            style={{
              width: 32, height: 32, background: c,
              border: value === c ? '3px solid var(--color-primary)' : '2px solid rgba(0,0,0,0.12)',
              transform: value === c ? 'scale(1.15)' : 'scale(1)',
              boxShadow: value === c ? '0 2px 8px rgba(62,196,109,0.35)' : 'none',
            }}
          />
        ))}
      </div>
    </div>
  );
}

export default function AvatarSelectPage() {
  const { user, userDoc } = useAuth();
  const router = useRouter();
  const [selected, setSelected] = useState<AvatarId | null>((userDoc?.avatarId as AvatarId | null) ?? null);
  const [shirt, setShirt] = useState<string>(userDoc?.avatarTint?.shirt ?? '');
  const [hair, setHair] = useState<string>(userDoc?.avatarTint?.hair ?? '');
  const [loading, setLoading] = useState(false);

  const preset = AVATAR_PRESETS.find((a) => a.id === selected) ?? null;

  const handleConfirm = async () => {
    if (!selected || !user || !db) return;
    setLoading(true);
    // 색을 안 고르면 null 로 둔다. 그래야 프리셋 본래 색이 그대로 나온다.
    await updateDoc(doc(db, 'users', user.uid), {
      avatarId: selected,
      avatarTint: { shirt: shirt || null, hair: hair || null },
    });
    router.replace('/');
  };

  return (
    <div
      className="flex min-h-dvh flex-col items-center px-6 pt-12 pb-24"
      style={{ background: 'linear-gradient(180deg, var(--color-sky) 0%, #FFFFFF 100%)' }}
    >
      <Mascot message="나를 대신할 캐릭터를 골라줘!" />

      <h1 className="text-lg font-bold mb-5 mt-4" style={{ color: 'var(--color-text-main)' }}>
        아바타 선택
      </h1>

      <div className="grid grid-cols-4 gap-2.5 w-full max-w-[360px] mb-6">
        {AVATAR_PRESETS.map((avatar) => (
          <button
            key={avatar.id}
            onClick={() => setSelected(avatar.id)}
            className="flex flex-col items-center gap-1 rounded-2xl p-2.5 transition-all"
            style={{
              background: selected === avatar.id ? 'var(--color-surface)' : 'rgba(255,255,255,0.7)',
              border: selected === avatar.id ? '3px solid var(--color-primary)' : '2px solid transparent',
              transform: selected === avatar.id ? 'scale(1.08)' : 'scale(1)',
              boxShadow: selected === avatar.id ? '0 4px 12px rgba(62,196,109,0.3)' : '0 1px 4px rgba(0,0,0,0.08)',
            }}
          >
            <span className="text-3xl">{avatar.emoji}</span>
            <span className="text-[12px] font-medium leading-tight text-center" style={{ color: 'var(--color-text-main)' }}>
              {avatar.label}
            </span>
          </button>
        ))}
      </div>

      {preset && (
        <div
          className="w-full max-w-[320px] rounded-3xl p-5 shadow-lg mb-6 flex flex-col items-center gap-4"
          style={{ background: 'var(--color-surface)' }}
        >
          <AvatarPreview preset={preset} shirt={shirt} hair={hair} />
          <div className="text-center">
            <div className="font-bold" style={{ color: 'var(--color-text-main)' }}>{preset.label}</div>
            <div className="text-sm mt-0.5" style={{ color: 'var(--color-text-sub)' }}>{preset.desc}</div>
          </div>

          <ColorRow title="👕 옷 색" colors={SHIRT_COLORS} value={shirt} onPick={(c) => setShirt(c === shirt ? '' : c)} />
          <ColorRow title="💇 머리 색" colors={HAIR_COLORS} value={hair} onPick={(c) => setHair(c === hair ? '' : c)} />

          {(shirt || hair) && (
            <button
              onClick={() => { setShirt(''); setHair(''); }}
              className="text-sm font-bold underline"
              style={{ color: 'var(--color-text-sub)' }}
            >
              원래 색으로 되돌리기
            </button>
          )}

          <div className="text-sm" style={{ color: 'var(--color-text-sub)' }}>
            ✨ 전시실에서 이 모습으로 걸어다녀요
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
