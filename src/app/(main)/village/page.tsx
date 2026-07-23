'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { VEHICLES } from '@/lib/village-travel';
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
/**
 * 조이스틱 — 휴대폰에서 **이게 없으면 아예 못 움직인다.**
 * 걸어다니는 3D 화면에는 빠짐없이 있어야 한다.
 */
const MobileJoystick = dynamic(() => import('@/components/gallery3d/MobileJoystick'), { ssr: false });

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
  /** 순간이동 목록에 '학교' 대신 진짜 이름이 뜨게 하려고 받아둔다 */
  const [schoolName, setSchoolName] = useState('학교');

  /** 이 아이가 산 탈것 id 들. 인벤토리에서 vehicle-* 만 골라 온다. */
  const [ownedVehicles, setOwnedVehicles] = useState<string[]>([]);
  /** 지금 고른 탈것. 착용 정보(avatarCustom.vehicle)에서 온다. */
  const vehicleId = userDoc?.avatarCustom?.vehicle ?? null;

  useEffect(() => {
    if (!db || !user) { setOwnedVehicles([]); return; }
    const known = new Set(VEHICLES.map((v) => v.shopId).filter(Boolean) as string[]);
    getDocs(collection(db, 'users', user.uid, 'inventory'))
      .then((snap) => setOwnedVehicles(snap.docs.map((d) => d.id).filter((id) => known.has(id))))
      .catch(() => setOwnedVehicles([]));
  }, [user]);

  /**
   * 탈것 바꾸기 — **서버가 착용을 확정한다**(가진 것만 낄 수 있다).
   * 모자·액세서리와 같은 길(`/api/shop` equip)이라 검증이 이미 있다.
   */
  const pickVehicle = async (id: string | null) => {
    if (!user) return;
    try {
      const token = await auth?.currentUser?.getIdToken();
      await fetch('/api/shop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` },
        body: JSON.stringify({ action: 'equip', slot: 'vehicle', itemId: id }),
      });
      // auth-context 의 userDoc 이 onSnapshot 으로 따라오므로 여기서 따로 안 고친다
    } catch {
      // 실패해도 조용히 — 다음에 다시 누르면 된다
    }
  };
  const [tried, setTried] = useState(false);

  useEffect(() => {
    if (!db) { setTried(true); return; }
    getDoc(doc(db, 'schools', schoolId))
      .then(async (s) => {
        if (s.exists() && s.data()?.name) setSchoolName(s.data()!.name as string);
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
    <div className="scene-page">
      {!tried ? (
        <div className="absolute inset-0 flex items-center justify-center" style={{ background: '#BFE8F5' }}>
          <div className="text-sm font-bold" style={{ color: '#6B5B43' }}>동네를 여는 중...</div>
        </div>
      ) : village ? (
        <VillageMapScene
          data={village}
          schoolId={schoolId}
          schoolName={schoolName}
          me={me}
          avatarId={userDoc?.avatarId}
          avatarCustom={userDoc?.avatarCustom}
          avatarTint={userDoc?.avatarTint}
          onEnterSchool={() => router.push(`/school/${schoolId}`)}
          ownedVehicles={ownedVehicles}
          vehicleId={vehicleId}
          onPickVehicle={pickVehicle}
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
        className="pos-top-safe absolute left-4 z-30 rounded-full px-4 py-2.5 text-sm font-bold"
        style={{ background: '#FFF8E7', color: '#6B5B43', border: '3px solid #EFE3CB', boxShadow: '0 4px 0 #E3D5B8' }}
      >
        ← 지도로
      </button>

      {/*
        말풍선은 **3층(`.pos-hint`)** 이다. `bottom-24` 로 두면 조이스틱과
        '타기' 버튼 사이에 끼어 글자가 양쪽에 가려진다(실제로 그랬다).
        폭도 화면 안으로 묶는다 — 길어지면 좌우로 삐져나간다.
      */}
      <div
        className="pos-hint absolute left-1/2 -translate-x-1/2 z-20 max-w-[calc(100%-1.5rem)] rounded-full px-4 py-2 text-center text-[13px] font-bold pointer-events-none"
        style={{ background: 'rgba(255,248,231,0.9)', color: '#6B5B43' }}
      >
        {village ? '우리 동네예요. 학교 자리를 누르면 들어가요' : '걸어다니다 문을 눌러보세요'}
      </div>

      {/* 모바일 조이스틱 */}
      <MobileJoystick />
    </div>
  );
}
