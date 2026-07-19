'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { ActivityDoc } from '@/lib/firestore-schema';
import { useAuth } from '@/lib/auth-context';
import { canManageClass } from '@/lib/auth-helpers';
import { APP_IMAGES } from '@/lib/image-urls';

const SCHOOL_ID = 'aewol-elementary';

const DEMO_ACTIVITIES = [
  { id: 'demo-1', title: '수채화 그리기', description: '봄 풍경을 수채화로 표현해봐요', date: '2025-03-15', artworkCount: 24 },
  { id: 'demo-2', title: '점토 공예', description: '나만의 동물 친구를 만들어요', date: '2025-04-10', artworkCount: 22 },
  { id: 'demo-3', title: '판화 수업', description: '고무판화로 나를 표현해요', date: '2025-05-20', artworkCount: 20 },
  { id: 'demo-4', title: '자화상 그리기', description: '거울 속 나의 모습을 그려봐요', date: '2025-06-05', artworkCount: 23 },
  { id: 'demo-5', title: '여름 일기', description: '여름 방학 추억을 글과 그림으로', date: '2025-07-18', artworkCount: 18 },
  { id: 'demo-6', title: '콜라주 만들기', description: '잡지와 색종이로 꿈의 세계를', date: '2025-09-12', artworkCount: 21 },
];

export default function ClassRoomPage() {
  const router = useRouter();
  const params = useParams();
  const classId = params.classId as string;
  const { role } = useAuth();
  const [activities, setActivities] = useState<(ActivityDoc & { id: string })[]>([]);

  useEffect(() => {
    async function fetchActivities() {
      if (!db) return;
      const q = query(
        collection(db, 'schools', SCHOOL_ID, 'classes', classId, 'activities'),
        orderBy('order', 'asc')
      );
      const snap = await getDocs(q);
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as ActivityDoc & { id: string }));
      setActivities(list);
    }
    fetchActivities();
  }, [classId]);

  const handleActivityClick = (activityId: string) => {
    router.push(`/class/${classId}/activity/${activityId}`);
  };

  const hasFirestoreData = activities.length > 0;
  const displayList = hasFirestoreData
    ? activities.map((a) => ({
        id: a.id,
        title: a.title,
        description: a.description,
        date: a.date && 'toDate' in a.date ? a.date.toDate().toLocaleDateString('ko-KR') : '',
        artworkCount: 0,
      }))
    : DEMO_ACTIVITIES;

  return (
    <div className="relative min-h-screen">
      {/* 교실 배경 이미지 */}
      <div className="absolute inset-0 z-0">
        <img
          src={APP_IMAGES.classroomInterior}
          alt="교실 내부"
          className="w-full h-full object-cover opacity-30"
        />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(255,245,230,0.7) 0%, var(--color-surface) 40%)' }} />
      </div>

      <div className="relative z-10 px-4 pt-6 pb-24 mx-auto max-w-[960px]">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <button
              onClick={() => router.push('/school')}
              className="text-xs mb-1 flex items-center gap-1"
              style={{ color: 'var(--color-text-sub)' }}
            >
              ← 학교로 돌아가기
            </button>
            <h1 className="text-xl font-bold" style={{ color: 'var(--color-text-main)' }}>
              📚 {classId} 교실
            </h1>
            <p className="text-xs mt-1" style={{ color: 'var(--color-text-sub)' }}>
              활동을 선택해서 전시실에 입장하세요
            </p>
          </div>

          {canManageClass(role) && (
            <button
              className="rounded-xl px-4 py-2 text-xs font-bold text-white shadow-md transition-transform hover:scale-105"
              style={{ background: 'var(--color-primary)' }}
            >
              + 활동 추가
            </button>
          )}
        </div>

        {/* 활동 카드 그리드 — 벽보 스타일 */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {displayList.map((activity, i) => {
            const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD'];
            const bgColor = colors[i % colors.length];

            return (
              <button
                key={activity.id}
                onClick={() => handleActivityClick(activity.id)}
                className="group flex flex-col rounded-2xl overflow-hidden shadow-md transition-all hover:scale-[1.03] hover:shadow-xl text-left"
                style={{ background: 'var(--color-surface)' }}
              >
                {/* 카드 상단 컬러 영역 */}
                <div
                  className="h-24 flex items-center justify-center text-3xl"
                  style={{ background: bgColor + '30' }}
                >
                  {['🎨', '🏺', '🖼️', '✏️', '📝', '✂️'][i % 6]}
                </div>

                {/* 카드 하단 정보 */}
                <div className="p-3">
                  <div className="text-sm font-bold mb-1" style={{ color: 'var(--color-text-main)' }}>
                    {activity.title}
                  </div>
                  <div className="text-[10px] leading-tight mb-2" style={{ color: 'var(--color-text-sub)' }}>
                    {activity.description}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px]" style={{ color: 'var(--color-text-sub)' }}>
                      {activity.date}
                    </span>
                    {activity.artworkCount > 0 && (
                      <span
                        className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                        style={{ background: 'var(--color-primary)', color: 'white' }}
                      >
                        {activity.artworkCount}작품
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
