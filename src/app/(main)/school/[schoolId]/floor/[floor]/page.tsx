'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useParams, useRouter } from 'next/navigation';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { floorCount, gradesOnFloor, type FloorClass } from '@/components/gallery3d/SchoolFloorScene';

const SchoolFloorScene = dynamic(
  () => import('@/components/gallery3d/SchoolFloorScene'),
  { ssr: false }
);

/**
 * 학교 복도.
 *
 * 현관에서 계단을 올라 층마다 교실 문을 찾아 들어간다.
 * **한 층에 두 학년**이고, 복도를 사이에 두고 왼쪽·오른쪽으로 나뉜다.
 * 반이 늘면 복도가 길어지고 학년이 늘면 층이 생긴다 — 손으로 고칠 것이 없다.
 */
export default function FloorPage() {
  const { user, userDoc } = useAuth();
  const router = useRouter();
  const params = useParams();
  const schoolId = params.schoolId as string;
  const floor = Math.max(1, parseInt(String(params.floor), 10) || 1);

  const [classes, setClasses] = useState<FloorClass[]>([]);
  const [gradeCount, setGradeCount] = useState(6);
  const [perGrade, setPerGrade] = useState(4);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db) return;
    (async () => {
      try {
        const s = await getDoc(doc(db!, 'schools', schoolId));
        if (s.exists()) {
          setGradeCount((s.data()?.gradeCount as number) ?? 6);
          setPerGrade((s.data()?.classPerGrade as number) ?? 4);
        }
        const snap = await getDocs(
          query(collection(db!, 'schools', schoolId, 'classes'), where('isArchived', '==', false))
        );
        setClasses(
          snap.docs.map((d) => {
            const v = d.data();
            return {
              id: d.id,
              grade: Number(v.grade) || 1,
              classNumber: Number(v.classNumber) || 1,
              teacherName: (v.teacherName as string) || '',
            };
          })
        );
      } finally {
        setLoading(false);
      }
    })();
  }, [schoolId]);

  const totalFloors = floorCount(gradeCount);
  const myClassId = userDoc?.classIds?.[0] ?? null;

  const me = user && userDoc ? {
    uid: user.uid,
    look: {
      name: userDoc.displayName || '친구',
      avatarId: userDoc.avatarId ?? null,
      shirt: userDoc.avatarTint?.shirt ?? null,
      hair: userDoc.avatarTint?.hair ?? null,
    },
  } : null;

  const [lowGrade, highGrade] = gradesOnFloor(floor);

  /** 내 반이 이 층에 있나 — 없으면 어디로 가야 하는지 알려준다 */
  const myClass = useMemo(
    () => classes.find((c) => c.id === myClassId),
    [classes, myClassId]
  );
  const myFloor = myClass ? Math.ceil(myClass.grade / 2) : null;

  return (
    <div className="relative min-h-dvh overflow-hidden">
      {loading ? (
        <div className="absolute inset-0 flex items-center justify-center" style={{ background: '#EFE7D6' }}>
          <div className="text-base font-bold" style={{ color: '#6B5B43' }}>복도를 여는 중...</div>
        </div>
      ) : (
        <SchoolFloorScene
          floor={floor}
          totalFloors={totalFloors}
          classes={classes}
          perGrade={perGrade}
          myClassId={myClassId}
          schoolId={schoolId}
          me={me}
          avatarId={userDoc?.avatarId}
          avatarCustom={userDoc?.avatarCustom}
          avatarTint={userDoc?.avatarTint}
          onEnterClass={(classId) => router.push(`/school/${schoolId}/class/${classId}/room`)}
          onGoFloor={(f) => router.push(`/school/${schoolId}/floor/${f}`)}
          onExit={() => router.push(`/school/${schoolId}/lobby`)}
        />
      )}

      <button
        onClick={() => router.push(`/school/${schoolId}/lobby`)}
        className="absolute left-4 top-4 z-30 rounded-full px-5 py-3 text-sm font-bold"
        style={{ background: '#FFF8E7', color: '#6B5B43', border: '3px solid #EFE3CB', boxShadow: '0 4px 0 #E3D5B8' }}
      >
        ← 현관
      </button>

      <div
        className="absolute right-4 top-4 z-30 rounded-2xl px-5 py-3 text-base font-black"
        style={{ background: '#FFF8E7', color: '#6B5B43', border: '3px solid #EFE3CB' }}
      >
        {floor}층 · {lowGrade}학년 / {highGrade}학년
      </div>

      {/* 내 반이 다른 층이면 어디로 가야 하는지 */}
      {!loading && myFloor && myFloor !== floor && (
        <button
          onClick={() => router.push(`/school/${schoolId}/floor/${myFloor}`)}
          className="absolute left-1/2 -translate-x-1/2 bottom-24 z-30 rounded-full px-6 py-3.5 text-base font-bold"
          style={{ background: '#FFE9A8', color: '#6B5B43', border: '3px solid #E8A33C', boxShadow: '0 5px 0 #C9832A' }}
        >
          ⭐ 우리 반은 {myFloor}층이에요 — 가기
        </button>
      )}
      {!loading && myClass && myFloor === floor && (
        <div
          className="absolute left-1/2 -translate-x-1/2 bottom-24 z-20 rounded-full px-5 py-3 text-sm font-bold pointer-events-none"
          style={{ background: 'rgba(255,248,231,0.92)', color: '#6B5B43' }}
        >
          ⭐ 표시가 우리 반이에요
        </div>
      )}
    </div>
  );
}
