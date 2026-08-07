'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

const OreumScene = dynamic(() => import('@/components/gallery3d/OreumScene'), { ssr: false });
/** 조이스틱 — 휴대폰에서 이게 없으면 아예 못 움직인다 */
const MobileJoystick = dynamic(() => import('@/components/gallery3d/MobileJoystick'), { ssr: false });

const FALLBACK_SCHOOL = 'aewol-elementary';

/**
 * 오름 — 지형 위를 걷는 첫 무대 (docs/10-jeju-warp-map.md).
 *
 * 마을에서 걸어 들어온다. 마당에서 흙길을 따라 정상 억새밭까지 올라간다.
 * 친구들과 같은 방(`oreum`)이라 오르는 길에 서로 보인다.
 */
export default function OreumPage() {
  const { user, userDoc } = useAuth();
  const router = useRouter();
  const schoolId = userDoc?.schoolIds?.[0] || FALLBACK_SCHOOL;

  const me = user && userDoc ? {
    uid: user.uid,
    look: {
      name: userDoc.displayName || '친구',
      avatarId: userDoc.avatarId ?? null,
      shirt: userDoc.avatarTint?.shirt ?? null,
      hair: userDoc.avatarTint?.hair ?? null,
    },
  } : null;

  return (
    <div className="scene-page">
      <OreumScene
        schoolId={schoolId}
        me={me}
        avatarId={userDoc?.avatarId}
        avatarCustom={userDoc?.avatarCustom}
        avatarTint={userDoc?.avatarTint}
      />

      <button
        onClick={() => router.push('/village')}
        className="pos-top-safe absolute left-4 z-30 rounded-full px-4 py-2.5 text-sm font-bold"
        style={{ background: '#FFF8E7', color: '#6B5B43', border: '3px solid #EFE3CB', boxShadow: '0 4px 0 #E3D5B8' }}
      >
        ← 마을로
      </button>

      <div
        className="pos-hint absolute left-1/2 -translate-x-1/2 z-20 max-w-[calc(100%-1.5rem)] rounded-full px-4 py-2 text-center text-[13px] font-bold pointer-events-none"
        style={{ background: 'rgba(255,248,231,0.9)', color: '#6B5B43' }}
      >
        흙길을 따라 정상까지 올라가 보세요
      </div>

      <MobileJoystick />
    </div>
  );
}
