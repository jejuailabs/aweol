'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import type { VillageSpot } from '@/components/gallery3d/VillageScene';
import type { VillageData } from '@/components/gallery3d/VillageMapScene';

const VillageScene = dynamic(
  () => import('@/components/gallery3d/VillageScene'),
  { ssr: false }
);
const VillageMapScene = dynamic(
  () => import('@/components/gallery3d/VillageMapScene'),
  { ssr: false }
);

/** 학교를 아직 모를 때 기본으로 데려갈 곳 */
const FALLBACK_SCHOOL = 'aewol-elementary';

/**
 * 마을.
 *
 * 새 기능을 만든 게 아니라 **흩어져 있던 입구를 걸어서 갈 수 있는 곳으로 모았다.**
 * 메뉴를 누르는 것과, 걸어가서 문을 여는 것은 아이에게 다른 경험이다.
 *
 * 친구들도 여기서 만난다 — 학교가 달라도 마을에서는 같이 있다.
 */
export default function VillagePage() {
  const { user, userDoc } = useAuth();
  const router = useRouter();

  // 내가 속한 학교로 데려간다. 없으면 애월초.
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

  /**
   * 학교가 자기 동네를 구워뒀으면 그걸 보여주고, 없으면 손으로 만든 마을을 보여준다.
   * 파일 하나(2KB 남짓)만 받으므로 지도 API 는 아예 안 부른다.
   */
  const [village, setVillage] = useState<VillageData | null>(null);
  const [tried, setTried] = useState(false);

  useEffect(() => {
    if (!db) { setTried(true); return; }
    getDoc(doc(db, 'schools', schoolId))
      .then(async (s) => {
        const url = s.exists() ? (s.data()?.villageUrl as string) : '';
        if (!url) return;
        const res = await fetch(url);
        if (res.ok) setVillage(await res.json());
      })
      .catch(() => {})
      .finally(() => setTried(true));
  }, [schoolId]);

  const enter = (spot: VillageSpot) => {
    if (spot === 'school') {
      router.push(`/school/${schoolId}`);
    } else if (spot === 'gallery') {
      router.push('/gallery');
    } else if (spot === 'shop') {
      router.push('/shop');
    } else {
      router.push('/');
    }
  };

  return (
    <div className="relative min-h-dvh overflow-hidden">
      {!tried ? (
        <div className="absolute inset-0 flex items-center justify-center" style={{ background: '#BFE8F5' }}>
          <div className="text-sm font-bold" style={{ color: '#6B5B43' }}>동네를 여는 중...</div>
        </div>
      ) : village ? (
        <VillageMapScene
          data={village}
          schoolId={schoolId}
          schoolName={userDoc?.schoolIds?.[0] === schoolId ? '우리 학교' : '학교'}
          me={me}
          avatarId={userDoc?.avatarId}
          avatarCustom={userDoc?.avatarCustom}
          avatarTint={userDoc?.avatarTint}
          onEnterSchool={() => router.push(`/school/${schoolId}`)}
        />
      ) : (
        <VillageScene
          schoolId={schoolId}
          me={me}
          avatarId={userDoc?.avatarId}
          avatarCustom={userDoc?.avatarCustom}
          avatarTint={userDoc?.avatarTint}
          onEnter={enter}
        />
      )}

      <button
        onClick={() => router.push('/')}
        className="absolute left-4 top-4 z-30 rounded-full px-4 py-2.5 text-sm font-bold"
        style={{ background: '#FFF8E7', color: '#6B5B43', border: '3px solid #EFE3CB', boxShadow: '0 4px 0 #E3D5B8' }}
      >
        ← 지도로
      </button>

      <div
        className="absolute left-1/2 -translate-x-1/2 bottom-24 z-20 rounded-full px-4 py-2 text-[13px] font-bold pointer-events-none"
        style={{ background: 'rgba(255,248,231,0.9)', color: '#6B5B43' }}
      >
        {village ? '우리 동네예요. 학교 자리를 누르면 들어가요' : '걸어다니다 문을 눌러보세요'}
      </div>
    </div>
  );
}
