'use client';

import dynamic from 'next/dynamic';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useRpgContent } from '@/lib/use-rpg-content';
import { useProgress } from '@/lib/use-progress';
import { placeKey, questKey, type Quest } from '@/lib/village-rpg';

const CivicPlaceScene = dynamic(() => import('@/components/gallery3d/CivicPlaceScene'), { ssr: false });

/**
 * 우리 동네 기관 안 — 마을에서 문을 눌러 들어온다.
 *
 * **주소가 기관 종류다**(`/school/{id}/place/townhall`). 학교마다 다른 건물이
 * 아니라 **종류마다 한 벌**이기 때문이다 — 우체국은 어느 동네에 있든 하는 일이 같다.
 * 그래서 표(`civic-places.ts`)에 한 줄 더 쓰면 기관이 하나 늘어난다.
 *
 * 심부름은 이 화면이 정하지 않는다. `village-rpg.ts` 의 표와
 * 아이의 조사 기록이 만나서 정해진다 — 여기는 그 결과를 3D 에 넘길 뿐이다.
 */
export default function CivicPlacePage() {
  const router = useRouter();
  const params = useParams();
  const schoolId = params.schoolId as string;
  const kind = params.kind as string;
  const { userDoc } = useAuth();
  const { done, mark } = useProgress();
  const rpg = useRpgContent(schoolId);

  // **학교가 고친 내용**을 본다. 기본값은 그 안에 이미 깔려 있다.
  const place = rpg.places.find((x) => x.kind === kind);
  const grade = Number(userDoc?.classIds?.[0]?.split('-')[0]) || undefined;

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

  const finish = (q: Quest) => {
    mark(questKey(q.id), { questId: q.id, chapter: q.chapter });
  };

  const goTo = (t: { kind: 'site' | 'place'; id: string }) => {
    router.push(
      t.kind === 'site'
        ? `/school/${schoolId}/site/${t.id}`
        : `/school/${schoolId}/place/${t.id}`
    );
  };

  return (
    <div className="scene-page">
      <CivicPlaceScene
        place={place}
        avatarId={userDoc?.avatarId}
        avatarCustom={userDoc?.avatarCustom}
        avatarTint={userDoc?.avatarTint}
        onExit={() => router.push('/village')}
        guideDone={done.has(placeKey(kind))}
        onGuideDone={() => mark(placeKey(kind), { kind })}
        progress={done}
        grade={grade}
        quests={rpg.quests}
        onFinishQuest={finish}
        onGoTo={goTo}
      />
    </div>
  );
}
