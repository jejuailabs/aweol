'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { collection, getDocs, query, orderBy, doc, setDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { ActivityDoc } from '@/lib/firestore-schema';
import { playSound } from '@/lib/sound';
import { useAuth } from '@/lib/auth-context';
import { isTeacherOfClass } from '@/lib/auth-helpers';
import type { ClassroomActivity } from '@/components/gallery3d/ClassroomScene';
import type { BoardItem } from '@/components/gallery3d/Blackboard';
import BlackboardList from '@/components/gallery3d/BlackboardList';
import type { NoticeKind } from '@/lib/firestore-schema';
import NoticeModal, { type NoticePost } from '@/components/notice/NoticeModal';
import { setMovementLock } from '@/components/gallery3d/walker';
import ShareButton from '@/components/common/ShareButton';
import BlackboardComposer, { type ComposerResult } from '@/components/gallery3d/BlackboardComposer';

const ClassroomScene = dynamic(() => import('@/components/gallery3d/ClassroomScene'), { ssr: false });
const MobileJoystick = dynamic(() => import('@/components/gallery3d/MobileJoystick'), { ssr: false });


const ACTIVITY_EMOJI = ['🎨', '🏺', '🖼️', '✏️', '📝', '✂️', '🌈', '🎭'];
const ACTIVITY_COLORS = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#F5A623', '#DDA0DD', '#5FA8D3', '#3EC46D'];

export default function ClassRoomPage() {
  const router = useRouter();
  const params = useParams();
  const schoolId = params.schoolId as string;
  const classId = params.classId as string;
  const { user, role, userDoc } = useAuth();
  const [activities, setActivities] = useState<ClassroomActivity[]>([]);
  const [fetched, setFetched] = useState(false);
  const [showList, setShowList] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [saving, setSaving] = useState(false);
  const [addErr, setAddErr] = useState('');
  const [hasRealData, setHasRealData] = useState(false);

  // ---- 알림판 ----
  const [notices, setNotices] = useState<NoticePost[]>([]);
  const [noticeKind, setNoticeKind] = useState<NoticeKind | null>(null);

  useEffect(() => {
    if (!db) return;
    const q = query(
      collection(db, 'schools', schoolId, 'classes', classId, 'notices'),
      orderBy('createdAt', 'desc')
    );
    return onSnapshot(q, (snap) => {
      setNotices(
        snap.docs.map((d) => {
          const v = d.data();
          return {
            id: d.id,
            kind: v.kind,
            title: v.title || '',
            body: v.body || '',
            forDate: v.forDate ?? null,
            authorName: v.authorName || '선생님',
            createdAt: v.createdAt?.toDate?.() ?? null,
          } as NoticePost;
        })
      );
    }, () => setNotices([]));
  }, [classId]);

  const noticeCounts = notices.reduce(
    (acc, n) => ({ ...acc, [n.kind]: (acc[n.kind] || 0) + 1 }),
    { notice: 0, meal: 0, homework: 0, quiz: 0, spot: 0, game: 0 } as Record<NoticeKind, number>
  );

  // 알림판에 걸 칸은 반 설정에서 온다 (선생님이 고른 것)
  useEffect(() => {
    if (!db) return;
    return onSnapshot(
      doc(db, 'schools', schoolId, 'classes', classId),
      (s) => {
        const t = s.exists() ? (s.data().noticeTabs as NoticeKind[] | undefined) : undefined;
        setNoticeTabs(Array.isArray(t) && t.length > 0 ? t : undefined);
      },
      () => setNoticeTabs(undefined)
    );
  }, [schoolId, classId]);

  // ---- 칠판 낙서 ----
  const [noticeTabs, setNoticeTabs] = useState<NoticeKind[] | undefined>(undefined);
  const [boardItems, setBoardItems] = useState<(BoardItem & { authorUid?: string })[]>([]);
  const [boardListOpen, setBoardListOpen] = useState(false);
  const [boardOpen, setBoardOpen] = useState(false);

  /**
   * **이 반**의 담임인가. 규칙(isTeacherOf)과 같은 조건이어야 한다.
   * '선생님이면 다 보이게' 두면 남의 반에서 버튼을 눌러보고 거부당한다.
   */
  const myClass = isTeacherOfClass(role, userDoc?.classIds, classId);
  /**
   * 칠판에 그릴 수 있는 사람 — **이 반 사람**이면 된다(아이든 담임이든).
   * 예전에는 '선생님이면 아무 반이나' 였다. 남의 반 칠판에 그릴 수 있는 것처럼
   * 보이다가 규칙에 막혔다.
   */
  const canDraw = !!userDoc && (myClass || (userDoc.classIds || []).includes(classId));

  // 칠판을 켠 동안에는 아바타를 세운다.
  // 그리는 중에 화면이 돌아가면 선이 엉뚱한 자리에 그어져 낙서가 엉망이 된다.
  const drawingNow = canDraw && boardOpen;
  useEffect(() => {
    setMovementLock(drawingNow);
    return () => setMovementLock(false);
  }, [drawingNow]);

  useEffect(() => {
    if (!db) return;
    const q = query(
      collection(db, 'schools', schoolId, 'classes', classId, 'blackboard'),
      orderBy('createdAt', 'asc')
    );
    return onSnapshot(q, (snap) => {
      setBoardItems(
        snap.docs.map((d) => {
          const v = d.data();
          // 서버는 [x,y,x,y,...] 평탄 배열로 저장한다 (Firestore가 중첩 배열을 못 씀)
          const flat: number[] = v.points || [];
          const pairs: number[][] = [];
          for (let i = 0; i + 1 < flat.length; i += 2) pairs.push([flat[i], flat[i + 1]]);
          return {
            id: d.id,
            kind: v.kind,
            points: pairs,
            color: v.color || '#FFFFFF',
            width: v.width || 5,
            text: v.text,
            authorName: v.authorName || '?',
            // 누가 지울 수 있는지 화면이 알아야 한다
            authorUid: v.authorUid || '',
          } as BoardItem & { authorUid: string };
        })
      );
    }, () => setBoardItems([]));
  }, [classId]);

  // 낙서는 서버를 거쳐 저장한다 (작성자 위조 방지 + IP 기록)
  const sendBoardItem = useCallback(
    async (payload: Record<string, unknown>) => {
      const token = await auth?.currentUser?.getIdToken();
      if (!token) return;
      await fetch('/api/blackboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ schoolId, classId, ...payload }),
      });
    },
    [classId]
  );

  /** 모달에서 확정한 낙서를 저장한다 (작성자·IP 는 서버가 기록) */
  const handleComposerCommit = useCallback(
    async (result: ComposerResult) => {
      for (const st of result.strokes) {
        // 좌표를 줄여서 전송량을 아낀다
        const thinned = st.points.filter((_, i) => i % 2 === 0 || i === st.points.length - 1);
        await sendBoardItem({ kind: 'stroke', points: thinned, color: st.color, width: st.width });
      }
      if (result.text) {
        await sendBoardItem({
          kind: 'text',
          points: [result.text.point],
          color: result.text.color,
          width: result.text.width,
          text: result.text.content,
        });
      }
    },
    [sendBoardItem]
  );

  const fetchActivities = useCallback(async () => {
    if (!db) { setFetched(true); return; }
    try {
      const q = query(
        collection(db, 'schools', schoolId, 'classes', classId, 'activities'),
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
    setAddErr('');
    const actId = `act-${Date.now()}`;
    try {
      await setDoc(doc(db, 'schools', schoolId, 'classes', classId, 'activities', actId), {
        title: newTitle.trim(),
        description: newDesc.trim(),
        date: serverTimestamp(),
        thumbnailUrl: '',
        order: activities.length,
      });
      setShowAdd(false);
      setNewTitle('');
      setNewDesc('');
      fetchActivities();
    } catch {
      /**
       * 여기 오는 건 거의 '내 반이 아니다' 다.
       * 규칙은 담임(`classIds` 에 이 반이 있는 사람)만 쓰게 하는데,
       * 예전에는 오류를 잡지 않아 '만드는 중...' 에서 영영 멈춰 있었다.
       */
      setAddErr(
        myClass
          ? '활동을 만들지 못했어요. 잠시 뒤 다시 해주세요.'
          : '내가 맡은 반이 아니라 활동을 만들 수 없어요. 총관리자에게 담임 배정을 요청해 주세요.'
      );
    } finally {
      // 성공하든 실패하든 반드시 푼다
      setSaving(false);
    }
  }, [newTitle, newDesc, schoolId, classId, activities.length, fetchActivities, myClass]);

  const isTeacher = myClass;
  // 항상 실데이터만 표시 — 가짜 활동은 클릭하면 빈 전시실로 가므로 쓰지 않는다
  const displayList = activities;
  const isEmpty = fetched && activities.length === 0;

  const handleEnter = (activityId: string) => {
    playSound('enter');
    router.push(`/school/${schoolId}/class/${classId}/activity/${activityId}`);
  };

  return (
    <div className="relative w-full h-dvh overflow-hidden">
      {/* 3D 교실 */}
      {/* 술래잡기 — 친구가 같이 있어야 재밌어서, 로그인한 사람에게만 보인다 */}
      {user && (
        <button
          onClick={() => router.push(`/school/${schoolId}/class/${classId}/tag`)}
          className="absolute right-4 top-20 z-30 rounded-full px-4 py-2.5 text-sm font-bold"
          style={{ background: '#FFF8E7', color: '#6B5B43', border: '3px solid #EFE3CB', boxShadow: '0 4px 0 #E3D5B8' }}
        >
          👹 술래잡기
        </button>
      )}

      <ClassroomScene
        schoolId={schoolId}
        classId={classId}
        me={user && userDoc ? {
          uid: user.uid,
          look: {
            name: userDoc.displayName || '친구',
            avatarId: userDoc.avatarId ?? null,
            shirt: userDoc.avatarTint?.shirt ?? null,
            hair: userDoc.avatarTint?.hair ?? null,
          },
        } : null}
        classLabel={classId}
        activities={displayList}
        onActivitySelect={handleEnter}
        canManage={isTeacher}
        onAddActivity={() => setShowAdd(true)}
        avatarId={userDoc?.avatarId}
        avatarCustom={userDoc?.avatarCustom}
        avatarTint={userDoc?.avatarTint}
        boardItems={boardItems}
        noticeCounts={noticeCounts}
        noticeTabs={noticeTabs}
        onOpenNotice={(k) => { playSound('open'); setNoticeKind(k); }}
      />

      {/* 상단 HUD — 한 줄 플렉스 (겹침 방지) */}
      <div className="absolute top-4 left-4 right-4 z-30 flex items-center gap-2">
        <button
          onClick={() => router.push(`/school/${schoolId}`)}
          className="ac-btn shrink-0 px-3.5 py-2 text-sm"
        >
          ← 학교로
        </button>
        <div className="ac-bubble hidden sm:block px-4 py-2 text-sm truncate">
          📚 {classId} 교실
        </div>
        <div className="ml-auto shrink-0">
          <ShareButton title={`📚 ${classId} 교실`} text="우리 반 교실을 구경해보세요" />
        </div>
        {canDraw && (
          <button
            onClick={() => setBoardOpen((v) => !v)}
            className={`ac-btn shrink-0 px-3.5 py-2 text-sm${boardOpen ? ' ac-btn-green' : ''}`}
          >
            ✏️ 칠판
          </button>
        )}
        <button
          onClick={() => setShowList(true)}
          className="ac-btn ac-btn-green shrink-0 px-3.5 py-2 text-sm"
        >
          📋 활동
        </button>
        {/*
          칠판 정리 — 쓴 게 있을 때만. 전에는 담임의 '전체 지우기' 밖에 없어서
          아이가 한 글자 잘못 쓰면 반 전체 칠판을 날리는 수밖에 없었다.
        */}
        {canDraw && boardItems.length > 0 && (
          <button
            onClick={() => setBoardListOpen(true)}
            className="ac-btn shrink-0 px-3.5 py-2 text-sm"
          >
            🧽 정리
          </button>
        )}
        {/*
          담임만 보인다. 지금까지는 교실에서 명부·활동을 고치려면 하단 '관리' 로
          나갔다가 학교·반을 다시 골라 들어와야 했다.
        */}
        {myClass && (
          <button
            onClick={() => router.push(`/admin/${schoolId}/class/${classId}`)}
            className="ac-btn shrink-0 px-3.5 py-2 text-sm"
          >
            🛠️ <span className="hidden sm:inline">우리 반 </span>관리
          </button>
        )}
      </div>

      {/* 칠판 정리 — 골라서 지운다 */}
      {boardListOpen && (
        <BlackboardList
          schoolId={schoolId}
          classId={classId}
          items={boardItems}
          canClearAll={myClass}
          onChanged={() => { /* onSnapshot 이 알아서 따라온다 */ }}
          onClose={() => setBoardListOpen(false)}
        />
      )}

      {/* 칠판 편집 — 2D 모달에서 그리고 배치한 뒤 확정한다 */}
      {canDraw && boardOpen && (
        <BlackboardComposer
          items={boardItems}
          authorName={userDoc?.displayName || '이름 없음'}
          onCommit={handleComposerCommit}
          onClose={() => setBoardOpen(false)}
        />
      )}

      {/* 빈 교실 안내 */}
      {isEmpty && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-30 px-4 w-full max-w-[400px] pointer-events-none">
          <div className="ac-bubble px-5 py-3.5 text-center text-[13px] leading-relaxed">
            {isTeacher
              ? '아직 활동이 없어요. 게시판의 ➕ 카드를 눌러 첫 수업을 만들어보세요!'
              : '아직 이 반에는 전시된 활동이 없어요. 선생님이 수업을 등록하면 여기에 걸립니다 🎨'}
          </div>
        </div>
      )}

      {/* 알림판 모달 */}
      {noticeKind && (
        <NoticeModal
          schoolId={schoolId}
          classId={classId}
          posts={notices}
          initialKind={noticeKind}
          onClose={() => setNoticeKind(null)}
        />
      )}

      {/* 모바일 조이스틱 */}
      {!showList && !showAdd && !noticeKind && <MobileJoystick />}

      {/* 하단 안내 */}
      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-30 pointer-events-none hidden sm:block">
        <div className="ac-bubble px-4 py-2.5 text-[13px]">
          🚶 WASD 걷기 · 🖱️ 드래그로 상하좌우 시점 · 휠/핀치 줌 · 게시판 포스터를 눌러 입장!
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
                    <div className="text-sm font-bold" style={{ color: 'var(--color-text-main)' }}>{act.title}</div>
                    <div className="text-[12px] mt-0.5 line-clamp-1" style={{ color: 'var(--color-text-sub)' }}>{act.description}</div>
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
              <p className="text-[13px] mt-1" style={{ color: 'var(--color-text-sub)' }}>
                게시판에 포스터가 붙고, 그 안에 작품을 전시할 수 있어요
              </p>
            </div>

            <div className="mb-3">
              <div className="text-[13px] font-bold mb-1.5" style={{ color: 'var(--color-text-sub)' }}>수업(활동) 이름 *</div>
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
              <div className="text-[13px] font-bold mb-1.5" style={{ color: 'var(--color-text-sub)' }}>한 줄 소개 (선택)</div>
              <input
                type="text"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="예: 봄 풍경을 수채화로 표현해봐요"
                className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-main)' }}
              />
            </div>

            {!myClass && (
              <div
                className="rounded-xl px-3 py-2.5 mb-3 text-[14px] leading-relaxed"
                style={{ background: '#EAF2FB', color: '#2F6DB5', border: '1px solid #C9DDF2' }}
              >
                ℹ️ 내가 맡은 반이 아니에요. 활동은 그 반 담임 선생님만 만들 수 있어요.
              </div>
            )}
            {addErr && (
              <div
                className="rounded-xl px-3 py-2.5 mb-3 text-[14px] font-bold leading-relaxed"
                style={{ background: '#FDECEA', color: '#B02A37', border: '1px solid #F5C6C4' }}
              >
                ⚠️ {addErr}
              </div>
            )}
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
                disabled={!newTitle.trim() || saving || !myClass}
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
