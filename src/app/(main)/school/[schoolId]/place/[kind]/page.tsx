'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useParams } from 'next/navigation';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { civicByKind } from '@/lib/civic-places';
import { sitesOfSchool } from '@/lib/local-sites';

const CivicPlaceScene = dynamic(() => import('@/components/gallery3d/CivicPlaceScene'), { ssr: false });

/**
 * 우리 동네 기관 안 — 마을에서 문을 눌러 들어온다.
 *
 * **주소가 기관 종류다**(`/school/{id}/place/townhall`). 학교마다 다른 건물이
 * 아니라 **종류마다 한 벌**이기 때문이다 — 우체국은 어느 동네에 있든 하는 일이 같다.
 * 그래서 표(`civic-places.ts`)에 한 줄 더 쓰면 기관이 하나 늘어난다.
 */
export default function CivicPlacePage() {
  const router = useRouter();
  const params = useParams();
  const schoolId = params.schoolId as string;
  const kind = params.kind as string;
  const { user, userDoc } = useAuth();

  const place = civicByKind(kind);

  /**
   * 이 곳 이야기를 이미 다 들었나.
   *
   * **아이 자기 문서에 남긴다**(`users/{uid}/quests/{kind}`). 심부름은 값어치가
   * 아니라 진행 표시라 서버를 거칠 이유가 없다 — 스스로 적어봤자 얻는 것은
   * 다음 이야기를 볼 수 있다는 것뿐이다.
   * 로그인 안 한 아이도 이야기는 들을 수 있다. 다만 남지 않는다.
   */
  const [guideDone, setGuideDone] = useState(false);
  useEffect(() => {
    if (!db || !user || !kind) return;
    getDoc(doc(db, 'users', user.uid, 'quests', `place-${kind}`))
      .then((s) => setGuideDone(s.exists() && s.data()?.done === true))
      .catch(() => {});
  }, [user, kind]);

  const markDone = () => {
    setGuideDone(true);
    if (!db || !user) return;
    setDoc(
      doc(db, 'users', user.uid, 'quests', `place-${kind}`),
      { done: true, kind, at: serverTimestamp() },
      { merge: true }
    ).catch(() => {
      // 못 남겨도 아이 화면은 그대로 진행된다 — 진행 표시 때문에 놀이가 막히면 안 된다
    });
  };

  /**
   * 밖으로 나가는 심부름이 어디까지 왔나.
   *
   * **두 군데를 본다** — 유적 쪽 기록(`site-{id}`, 다녀왔나)과
   * 이 기관 쪽 기록(`mission-{id}`, 상을 받았나). 다녀온 것과 알린 것은 다른 일이라
   * 한 칸으로는 못 적는다.
   *
   * 그리고 **그 유적이 이 학교 마을에 있어야** 심부름이 뜬다. 없는 곳으로
   * 보내면 아이는 마을을 헤맨다.
   */
  const mission = place?.mission;
  const hasSite = !!mission && sitesOfSchool(schoolId).some((s) => s.id === mission.siteId);

  /** 다녀왔나 / 상을 받았나 — 두 가지만 담고, 보여줄 상태는 아래에서 계산한다 */
  const [visited, setVisited] = useState(false);
  const [claimed, setClaimed] = useState(false);

  useEffect(() => {
    if (!db || !user || !mission || !hasSite) return;
    const uid = user.uid;
    Promise.all([
      getDoc(doc(db, 'users', uid, 'quests', `site-${mission.siteId}`)),
      getDoc(doc(db, 'users', uid, 'quests', `mission-${mission.siteId}`)),
    ])
      .then(([v, c]) => {
        setVisited(v.exists() && v.data()?.done === true);
        setClaimed(c.exists() && c.data()?.done === true);
      })
      .catch(() => {
        // 못 읽으면 아직 안 다녀온 것으로 본다 — 심부름이 사라지는 것보다 낫다
      });
  }, [user, mission, hasSite]);

  /**
   * 로그인 안 한 아이에게도 심부름은 보인다. 다만 다녀온 것이 남지 않아
   * 늘 `todo` 다 — 놀이를 막을 이유는 없다.
   */
  const missionState: 'hidden' | 'todo' | 'ready' | 'done' =
    !hasSite ? 'hidden' : claimed ? 'done' : visited ? 'ready' : 'todo';

  const claimMission = () => {
    if (!mission) return;
    setClaimed(true);
    if (!db || !user) return;
    setDoc(
      doc(db, 'users', user.uid, 'quests', `mission-${mission.siteId}`),
      { done: true, siteId: mission.siteId, kind, at: serverTimestamp() },
      { merge: true }
    ).catch(() => {});
  };

  // 모르는 곳이면 지어내지 않는다 — 마을로 돌려보낸다
  if (!place) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
        <span className="text-5xl">🏚️</span>
        <p className="text-sm" style={{ color: 'var(--color-text-sub)' }}>
          아직 들어가 볼 수 없는 곳이에요
        </p>
        <button
          onClick={() => router.push('/village')}
          className="rounded-full px-6 py-2.5 text-sm font-bold text-white"
          style={{ background: 'var(--color-primary)' }}
        >
          마을로 돌아가기
        </button>
      </div>
    );
  }

  return (
    <div className="scene-page">
      <CivicPlaceScene
        place={place}
        avatarId={userDoc?.avatarId}
        avatarCustom={userDoc?.avatarCustom}
        avatarTint={userDoc?.avatarTint}
        onExit={() => router.push('/village')}
        guideDone={guideDone}
        onGuideDone={markDone}
        missionState={missionState}
        onGoSite={() => mission && router.push(`/school/${schoolId}/site/${mission.siteId}`)}
        onClaimMission={claimMission}
      />
    </div>
  );
}
