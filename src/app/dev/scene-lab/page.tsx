'use client';

/**
 * scene-lab — **마을 씬을 로그인 없이 로컬에서 보는 실험실.**
 *
 * 그동안 아트 수정을 배포해서 사용자 눈으로 확인했다 — 매번 프로덕션이
 * 시안 검토장이 됐다. 여기서 실제 VillageMapScene 을 실제 애월 데이터
 * (src/dev-fixtures, 구운 JSON 을 내려받은 사본)로 띄워 **보고 나서** 푸시한다.
 *
 * 프로덕션에서는 404 — 실험실이 아이들 눈에 띄면 안 된다.
 */
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { notFound } from 'next/navigation';
import { homeSpot, spotsOfSchool } from '@/lib/village-spots';
import { resetControls } from '@/components/gallery3d/walker';
import { saveReturn } from '@/lib/village-return';
import type { VillageData } from '@/components/gallery3d/VillageMapScene';
import villageJson from '@/dev-fixtures/aewol-village.json';

const VillageMapScene = dynamic(
  () => import('@/components/gallery3d/VillageMapScene'),
  { ssr: false }
);
const MobileJoystick = dynamic(() => import('@/components/gallery3d/MobileJoystick'), { ssr: false });

const SCHOOL = 'aewol-elementary';
const noop = () => {};

export default function SceneLabPage() {
  if (process.env.NODE_ENV === 'production') notFound();

  const spots = spotsOfSchool(SCHOOL);
  const home = homeSpot(SCHOOL);

  /**
   * 시점을 주소로 조종한다 — 스크린샷을 기계로 찍기 위한 손잡이.
   *   ?x=0&z=18&yaw=0&dist=9&pitch=0.3
   * 선 자리는 복귀표(saveReturn)를 미리 심어 씬이 그 자리에서 시작하게 한다.
   */
  const [cam] = useState(() => {
    if (typeof window === 'undefined') return null;
    const q = new URLSearchParams(window.location.search);
    const n = (k: string, d: number) => {
      const v = parseFloat(q.get(k) ?? '');
      return Number.isFinite(v) ? v : d;
    };
    const x = n('x', 0), z = n('z', 30), yaw = n('yaw', 0);
    if (q.has('x') || q.has('z')) saveReturn(home?.id ?? 'aewol', x, z, yaw);
    return { yaw, dist: n('dist', 12), pitch: n('pitch', 0.45) };
  });
  useEffect(() => {
    // 씬(자식)의 resetControls 뒤에 실행된다 — 부모 effect 가 나중이라 이긴다
    if (cam) resetControls(cam.yaw, cam.dist, cam.pitch);
  }, [cam]);

  return (
    // (main) 레이아웃 밖이라 부모 높이가 없다 — 화면에 직접 고정한다
    <div className="scene-page" style={{ position: 'fixed', inset: 0 }}>
      <VillageMapScene
        data={villageJson as unknown as VillageData}
        schoolId={SCHOOL}
        schoolName="애월초등학교"
        me={null}
        onEnterSchool={noop}
        onEnterPlace={noop}
        onEnterSite={noop}
        localSites={[]}
        localPlaces={[]}
        spots={spots}
        currentSpot={home}
        onGoSpot={noop}
        isHome
        picked={new Set<string>()}
        onPickUp={noop}
        cleared={new Set<string>()}
        onPurify={noop}
      />
      <MobileJoystick />
    </div>
  );
}
