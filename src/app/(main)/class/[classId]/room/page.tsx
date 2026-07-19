'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { collection, getDocs, query, orderBy, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { ActivityDoc } from '@/lib/firestore-schema';
import { useAuth } from '@/lib/auth-context';
import { canManageClass } from '@/lib/auth-helpers';
import type { ClassroomActivity } from '@/components/gallery3d/ClassroomScene';

const ClassroomScene = dynamic(() => import('@/components/gallery3d/ClassroomScene'), { ssr: false });
const MobileJoystick = dynamic(() => import('@/components/gallery3d/MobileJoystick'), { ssr: false });

const SCHOOL_ID = 'aewol-elementary';

const ACTIVITY_EMOJI = ['🎨', '🏺', '🖼️', '✏️', '📝', '✂️', '🌈', '🎭'];
const ACTIVITY_COLORS = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#F5A623', '#DDA0DD', '#5FA8D3', '#3EC46D'];

export default function ClassRoomPage() {
  const router = useRouter();
  const params = useParams();
  const classId = params.classId as string;
  const { role, userDoc } = useAuth();
  const [activities, setActivities] = useState<ClassroomActivity[]>([]);
  const [fetched, setFetched] = useState(false);
  const [showList, setShowList] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [saving, setSaving] = useState(false);
  const [hasRealData, setHasRealData] = useState(false);

  const fetchActivities = useCallback(async () => {
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
      setHasRealData(list.length > 0);
    } catch (e) {
      console.error('Failed to fetch activities:', e);
    }
    setFetched(true);
  }, [classId]);

  useEffect(() => {
    fetchActivities();
  }, [fetchActivities]);

  const handleAddActivity = useCallback(async () => {
    if (!db || !newTitle.trim()) return;
    setSaving(true);
    const actId = `act-${Date.now()}`;
    await setDoc(doc(db, 'schools', SCHOOL_ID, 'classes', classId, 'activities', actId), {
      title: newTitle.trim(),
      description: newDesc.trim(),
      date: serverTimestamp(),
      thumbnailUrl: '',
      order: activities.length,
    });
    setSaving(false);
    setShowAdd(false);
    setNewTitle('');
    setNewDesc('');
    fetchActivities();
  }, [newTitle, newDesc, classId, activities.length, fetchActivities]);

  const isTeacher = canManageClass(role);
  // 항상 실데이터만 표시 — 가짜 활동은 클릭하면 빈 전시실로 가므로 쓰지 않는다
  const displayList = activities;
  const isEmpty = fetched && activities.length === 0;

  const handleEnter = (activityId: string) => {
    router.push(`/class/${classId}/activity/${activityId}`);
  };

  return (
    <div className="relative w-full h-screen overflow-hidden">
      {/* 3D 교실 */}
      <ClassroomScene
        classLabel={classId}
        activities={displayList}
        onActivitySelect={handleEnter}
        canManage={isTeacher}
        onAddActivity={() => setShowAdd(true)}
        avatarId={userDoc?.avatarId}
      />

      {/* 상단 HUD — 한 줄 플렉스 (겹침 방지) */}
      <div className="absolute top-4 left-4 right-4 z-30 flex items-center gap-2">
        <button
          onClick={() => router.push('/school')}
          className="ac-btn shrink-0 px-3.5 py-2 text-xs"
        >
          ← 학교로
        </button>
        <div className="ac-bubble hidden sm:block px-4 py-2 text-xs truncate">
          📚 {classId} 교실
        </div>
        <button
          onClick={() => setShowList(true)}
          className="ac-btn ac-btn-green ml-auto shrink-0 px-3.5 py-2 text-xs"
        >
          📋 활동 목록
        </button>
      </div>

      {/* 빈 교실 안내 */}
      {isEmpty && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-30 px-4 w-full max-w-[400px] pointer-events-none">
          <div className="ac-bubble px-5 py-3.5 text-center text-[11px] leading-relaxed">
            {isTeacher
              ? '아직 활동이 없어요. 게시판의 ➕ 카드를 눌러 첫 수업을 만들어보세요!'
              : '아직 이 반에는 전시된 활동이 없어요. 선생님이 수업을 등록하면 여기에 걸립니다 🎨'}
          </div>
        </div>
      )}

      {/* 모바일 조이스틱 */}
      {!showList && !showAdd && <MobileJoystick />}

      {/* 하단 안내 */}
      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-30 pointer-events-none hidden sm:block">
        <div className="ac-bubble px-4 py-2.5 text-[11px]">
          🚶 WASD 걷기 · 🖱️ 드래그 회전 · 휠/핀치 줌 · 게시판 포스터를 눌러 입장!
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

      {/* 새 활동 만들기 모달 (교사 전용) */}
      {showAdd && (
        <div
          className="modal-backdrop absolute inset-0 z-50 flex items-center justify-center px-5"
          style={{ background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(4px)' }}
          onClick={() => setShowAdd(false)}
        >
          <div
            className="modal-card w-full max-w-[360px] rounded-3xl p-6"
            style={{ background: 'var(--color-surface)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center mb-5">
              <div className="text-3xl mb-1">📌</div>
              <h3 className="text-base font-bold" style={{ color: 'var(--color-text-main)' }}>새 활동 만들기</h3>
              <p className="text-[11px] mt-1" style={{ color: 'var(--color-text-sub)' }}>
                게시판에 포스터가 붙고, 그 안에 작품을 전시할 수 있어요
              </p>
            </div>

            <div className="mb-3">
              <div className="text-[11px] font-bold mb-1.5" style={{ color: 'var(--color-text-sub)' }}>수업(활동) 이름 *</div>
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="예: 수채화 그리기"
                className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-main)' }}
                autoFocus
              />
            </div>

            <div className="mb-5">
              <div className="text-[11px] font-bold mb-1.5" style={{ color: 'var(--color-text-sub)' }}>한 줄 소개 (선택)</div>
              <input
                type="text"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="예: 봄 풍경을 수채화로 표현해봐요"
                className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-main)' }}
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setShowAdd(false)}
                className="flex-1 rounded-xl py-3 text-sm font-bold"
                style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-sub)' }}
              >
                취소
              </button>
              <button
                onClick={handleAddActivity}
                disabled={!newTitle.trim() || saving}
                className="flex-1 rounded-xl py-3 text-sm font-bold text-white disabled:opacity-50"
                style={{ background: 'var(--color-primary)' }}
              >
                {saving ? '만드는 중...' : '게시판에 붙이기'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
