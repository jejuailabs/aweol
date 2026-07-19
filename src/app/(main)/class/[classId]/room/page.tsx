'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { ActivityDoc } from '@/lib/firestore-schema';
import type { ClassroomActivity } from '@/components/gallery3d/ClassroomScene';

const ClassroomScene = dynamic(() => import('@/components/gallery3d/ClassroomScene'), { ssr: false });

const SCHOOL_ID = 'aewol-elementary';

const ACTIVITY_EMOJI = ['🎨', '🏺', '🖼️', '✏️', '📝', '✂️', '🌈', '🎭'];
const ACTIVITY_COLORS = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#F5A623', '#DDA0DD', '#5FA8D3', '#3EC46D'];

const DEMO_ACTIVITIES: ClassroomActivity[] = [
  { id: 'demo-1', title: '수채화 그리기', description: '봄 풍경을 수채화로 표현해봐요', date: '2025. 3. 15.', emoji: '🎨', color: '#FF6B6B' },
  { id: 'demo-2', title: '점토 공예', description: '나만의 동물 친구를 만들어요', date: '2025. 4. 10.', emoji: '🏺', color: '#4ECDC4' },
  { id: 'demo-3', title: '판화 수업', description: '고무판화로 나를 표현해요', date: '2025. 5. 20.', emoji: '🖼️', color: '#45B7D1' },
  { id: 'demo-4', title: '자화상 그리기', description: '거울 속 나의 모습을 그려봐요', date: '2025. 6. 5.', emoji: '✏️', color: '#96CEB4' },
  { id: 'demo-5', title: '여름 일기', description: '여름 방학 추억을 글과 그림으로', date: '2025. 7. 18.', emoji: '📝', color: '#F5A623' },
  { id: 'demo-6', title: '콜라주 만들기', description: '잡지와 색종이로 꿈의 세계를', date: '2025. 9. 12.', emoji: '✂️', color: '#DDA0DD' },
];

export default function ClassRoomPage() {
  const router = useRouter();
  const params = useParams();
  const classId = params.classId as string;
  const [activities, setActivities] = useState<ClassroomActivity[]>([]);
  const [fetched, setFetched] = useState(false);
  const [showList, setShowList] = useState(false);

  useEffect(() => {
    async function fetchActivities() {
      if (!db) { setFetched(true); return; }
      try {
        const q = query(
          collection(db, 'schools', SCHOOL_ID, 'classes', classId, 'activities'),
          orderBy('order', 'asc')
        );
        const snap = await getDocs(q);
        const list = snap.docs.map((d, i) => {
          const data = d.data() as ActivityDoc;
          return {
            id: d.id,
            title: data.title,
            description: data.description,
            date: data.date && 'toDate' in data.date ? data.date.toDate().toLocaleDateString('ko-KR') : '',
            emoji: ACTIVITY_EMOJI[i % ACTIVITY_EMOJI.length],
            color: ACTIVITY_COLORS[i % ACTIVITY_COLORS.length],
          };
        });
        setActivities(list);
      } catch (e) {
        console.error('Failed to fetch activities:', e);
      }
      setFetched(true);
    }
    fetchActivities();
  }, [classId]);

  const displayList = activities.length > 0 ? activities : fetched ? DEMO_ACTIVITIES : [];

  const handleEnter = (activityId: string) => {
    router.push(`/class/${classId}/activity/${activityId}`);
  };

  return (
    <div className="relative w-full h-screen overflow-hidden">
      {/* 3D 교실 */}
      <ClassroomScene classLabel={classId} activities={displayList} onActivitySelect={handleEnter} />

      {/* 상단 HUD */}
      <div className="absolute top-4 left-4 z-30 flex items-center gap-3">
        <button
          onClick={() => router.push('/school')}
          className="rounded-full px-4 py-2 text-xs font-bold shadow-lg backdrop-blur-md transition-transform hover:scale-105"
          style={{ background: 'rgba(255,255,255,0.88)', color: '#2B2B2B' }}
        >
          ← 학교로
        </button>
        <div
          className="rounded-full px-4 py-2 text-xs font-bold shadow-lg backdrop-blur-md"
          style={{ background: 'rgba(255,255,255,0.88)', color: '#2B2B2B' }}
        >
          📚 {classId} 교실
        </div>
      </div>

      {/* 목록 보기 토글 (모바일 배려) */}
      <button
        onClick={() => setShowList(true)}
        className="absolute top-4 right-4 z-30 rounded-full px-4 py-2 text-xs font-bold shadow-lg backdrop-blur-md transition-transform hover:scale-105"
        style={{ background: 'rgba(62,196,109,0.92)', color: 'white' }}
      >
        📋 활동 목록
      </button>

      {/* 하단 안내 */}
      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
        <div
          className="rounded-2xl px-4 py-2.5 text-[11px] font-medium shadow-lg backdrop-blur-md"
          style={{ background: 'rgba(255,255,255,0.85)', color: '#6B7280' }}
        >
          오른쪽 게시판의 활동 포스터를 눌러 전시실로 입장하세요 🖱️
        </div>
      </div>

      {/* 활동 목록 바텀시트 */}
      {showList && (
        <div
          className="absolute inset-0 z-40 flex items-end sm:items-center sm:justify-center"
          style={{ background: 'rgba(0,0,0,0.45)' }}
          onClick={() => setShowList(false)}
        >
          <div
            className="w-full sm:max-w-[560px] max-h-[75vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl p-5"
            style={{ background: 'var(--color-surface)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold" style={{ color: 'var(--color-text-main)' }}>🎨 활동 목록</h2>
              <button
                onClick={() => setShowList(false)}
                className="w-7 h-7 rounded-full text-sm"
                style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-sub)' }}
              >
                ✕
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {displayList.map((act) => (
                <button
                  key={act.id}
                  onClick={() => handleEnter(act.id)}
                  className="flex flex-col rounded-2xl overflow-hidden shadow-md text-left transition-transform hover:scale-[1.02]"
                  style={{ background: 'var(--color-surface)' }}
                >
                  <div className="h-16 flex items-center justify-center text-3xl" style={{ background: act.color + '30' }}>
                    {act.emoji}
                  </div>
                  <div className="p-2.5">
                    <div className="text-xs font-bold" style={{ color: 'var(--color-text-main)' }}>{act.title}</div>
                    <div className="text-[10px] mt-0.5 line-clamp-1" style={{ color: 'var(--color-text-sub)' }}>{act.description}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
