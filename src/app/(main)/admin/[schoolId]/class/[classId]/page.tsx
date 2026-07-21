'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { doc, getDoc, updateDoc, collection, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { ClassDoc, ActivityDoc, NoticeKind } from '@/lib/firestore-schema';
import { NOTICE_TABS } from '@/components/gallery3d/NoticeWall';
import { useAuth } from '@/lib/auth-context';
import { canAccessAdmin } from '@/lib/auth-helpers';


export default function AdminClassPage() {
  const router = useRouter();
  const params = useParams();
  const schoolId = params.schoolId as string;
  const classId = params.classId as string;
  const { user, role, loading } = useAuth();

  const [classDoc, setClassDoc] = useState<ClassDoc | null>(null);
  const [activities, setActivities] = useState<(ActivityDoc & { id: string })[]>([]);
  const [editing, setEditing] = useState(false);
  const [motto, setMotto] = useState('');
  const [introText, setIntroText] = useState('');
  const [noticeTabs, setNoticeTabs] = useState<NoticeKind[]>([]);
  const [savingTabs, setSavingTabs] = useState(false);
  const [tabMsg, setTabMsg] = useState('');
  const [showAddActivity, setShowAddActivity] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [archiveMsg, setArchiveMsg] = useState('');
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');

  useEffect(() => {
    if (!loading && (!user || !canAccessAdmin(role))) {
      router.replace('/');
      return;
    }

    async function fetchData() {
      if (!db) return;
      const snap = await getDoc(doc(db, 'schools', schoolId, 'classes', classId));
      if (snap.exists()) {
        const data = snap.data() as ClassDoc;
        setClassDoc(data);
        setMotto(data.motto);
        setIntroText(data.introText);
        // 설정한 적이 없으면 전부 켜진 상태로 시작한다 (지금 화면과 같게)
        setNoticeTabs(
          Array.isArray(data.noticeTabs) && data.noticeTabs.length > 0
            ? data.noticeTabs
            : NOTICE_TABS.map((t) => t.kind)
        );
      }

      const actSnap = await getDocs(collection(db, 'schools', schoolId, 'classes', classId, 'activities'));
      const list = actSnap.docs
        .map((d) => ({ id: d.id, ...d.data() } as ActivityDoc & { id: string }))
        .sort((a, b) => a.order - b.order);
      setActivities(list);
    }

    if (!loading && user) fetchData();
  }, [schoolId, classId, user, role, loading, router]);

  const handleSaveSettings = async () => {
    if (!db) return;
    await updateDoc(doc(db, 'schools', schoolId, 'classes', classId), {
      motto: motto.trim(),
      introText: introText.trim(),
    });
    setClassDoc((prev) => prev ? { ...prev, motto: motto.trim(), introText: introText.trim() } : prev);
    setEditing(false);
  };

  /** 알림판에 걸 칸 저장. 하나도 안 걸면 아이가 들어와도 볼 게 없으니 막는다. */
  const handleSaveTabs = useCallback(async (next: NoticeKind[]) => {
    if (!db || next.length === 0) return;
    setSavingTabs(true);
    setTabMsg('');
    try {
      await updateDoc(doc(db, 'schools', schoolId, 'classes', classId), { noticeTabs: next });
      setNoticeTabs(next);
      setTabMsg('알림판을 바꿨어요');
      setTimeout(() => setTabMsg(''), 2500);
    } finally {
      setSavingTabs(false);
    }
  }, [schoolId, classId]);

  const handleAddActivity = async () => {
    if (!db || !newTitle.trim()) return;
    const order = activities.length + 1;
    const ref = await addDoc(collection(db, 'schools', schoolId, 'classes', classId, 'activities'), {
      title: newTitle.trim(),
      description: newDesc.trim(),
      thumbnailUrl: '',
      order,
      date: serverTimestamp(),
    });
    setActivities((prev) => [
      ...prev,
      { id: ref.id, title: newTitle.trim(), description: newDesc.trim(), thumbnailUrl: '', order, date: serverTimestamp() as any },
    ]);
    setNewTitle('');
    setNewDesc('');
    setShowAddActivity(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-sm" style={{ color: 'var(--color-text-sub)' }}>로딩 중...</div>
      </div>
    );
  }

  return (
    <div className="px-4 pt-6 pb-24">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.push(`/admin/${schoolId}`)}
          className="text-sm"
          style={{ color: 'var(--color-text-sub)' }}
        >
          ← 대시보드
        </button>
        <h1 className="text-xl font-bold" style={{ color: 'var(--color-text-main)' }}>
          {classDoc ? `${classDoc.grade}-${classDoc.classNumber}반 관리` : classId}
        </h1>
      </div>

      {/* 알림판에 걸 칸 고르기 */}
      <div className="rounded-2xl p-4 mb-4" style={{ background: 'var(--color-surface-soft)' }}>
        <h2 className="text-sm font-bold mb-1" style={{ color: 'var(--color-text-main)' }}>
          📢 알림판에 걸 것
        </h2>
        <p className="text-[13px] mb-3 leading-relaxed" style={{ color: 'var(--color-text-sub)' }}>
          교실 알림판에 걸어둘 칸을 고르세요. 안 쓰는 칸을 걸어두면 아이들이
          빈 칸을 눌러보고 실망해요. 나중에 언제든 다시 켤 수 있어요.
        </p>
        <div className="flex flex-wrap gap-2">
          {NOTICE_TABS.map((t) => {
            const on = noticeTabs.includes(t.kind);
            const last = on && noticeTabs.length === 1;
            return (
              <button
                key={t.kind}
                disabled={savingTabs || last}
                onClick={() =>
                  handleSaveTabs(
                    on ? noticeTabs.filter((k) => k !== t.kind) : [...noticeTabs, t.kind]
                  )
                }
                title={last ? '적어도 하나는 걸어두어야 해요' : undefined}
                className="flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[14px] font-bold disabled:opacity-60"
                style={{
                  background: on ? t.color : 'var(--color-surface)',
                  color: on ? 'white' : 'var(--color-text-sub)',
                  border: `2px solid ${on ? t.color : 'transparent'}`,
                }}
              >
                <span>{t.emoji}</span>
                {t.label}
                <span style={{ opacity: 0.75 }}>{on ? '켬' : '끔'}</span>
              </button>
            );
          })}
        </div>
        {tabMsg && (
          <div className="text-[13px] font-bold mt-2" style={{ color: 'var(--color-primary)' }}>
            {tabMsg}
          </div>
        )}
      </div>

      {/* 학급 설정 */}
      <div className="rounded-2xl p-4 mb-6" style={{ background: 'var(--color-surface-soft)' }}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold" style={{ color: 'var(--color-text-main)' }}>학급 설정</h2>
          {!editing ? (
            <button
              onClick={() => setEditing(true)}
              className="text-sm font-bold px-3 py-1 rounded-lg"
              style={{ background: 'var(--color-primary)', color: 'white' }}
            >
              수정
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => setEditing(false)}
                className="text-sm px-3 py-1 rounded-lg"
                style={{ background: 'var(--color-surface)', color: 'var(--color-text-sub)' }}
              >
                취소
              </button>
              <button
                onClick={handleSaveSettings}
                className="text-sm font-bold px-3 py-1 rounded-lg"
                style={{ background: 'var(--color-primary)', color: 'white' }}
              >
                저장
              </button>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-[12px] font-bold block mb-1" style={{ color: 'var(--color-text-sub)' }}>
              담임선생님
            </label>
            <div className="text-sm" style={{ color: 'var(--color-text-main)' }}>
              {classDoc?.teacherName || '-'}
            </div>
          </div>
          <div>
            <label className="text-[12px] font-bold block mb-1" style={{ color: 'var(--color-text-sub)' }}>
              급훈
            </label>
            {editing ? (
              <input
                type="text"
                value={motto}
                onChange={(e) => setMotto(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={{ background: 'var(--color-surface)', color: 'var(--color-text-main)' }}
              />
            ) : (
              <div className="text-sm" style={{ color: 'var(--color-text-main)' }}>
                {classDoc?.motto || '-'}
              </div>
            )}
          </div>
          <div>
            <label className="text-[12px] font-bold block mb-1" style={{ color: 'var(--color-text-sub)' }}>
              학급 소개
            </label>
            {editing ? (
              <textarea
                value={introText}
                onChange={(e) => setIntroText(e.target.value)}
                rows={3}
                className="w-full rounded-lg px-3 py-2 text-sm outline-none resize-none"
                style={{ background: 'var(--color-surface)', color: 'var(--color-text-main)' }}
              />
            ) : (
              <div className="text-sm" style={{ color: 'var(--color-text-main)' }}>
                {classDoc?.introText || '-'}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 활동 관리 */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold" style={{ color: 'var(--color-text-main)' }}>
          활동 목록 ({activities.length})
        </h2>
        <button
          onClick={() => setShowAddActivity(true)}
          className="text-sm font-bold px-3 py-1.5 rounded-lg"
          style={{ background: 'var(--color-primary)', color: 'white' }}
        >
          + 활동 추가
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {activities.map((act, i) => (
          <div
            key={act.id}
            className="flex items-center gap-3 rounded-2xl p-3"
            style={{ background: 'var(--color-surface-soft)' }}
          >
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold"
              style={{ background: 'var(--color-primary)', color: 'white' }}
            >
              {i + 1}
            </div>
            <div className="flex-1">
              <div className="text-sm font-bold" style={{ color: 'var(--color-text-main)' }}>
                {act.title}
              </div>
              <div className="text-[12px]" style={{ color: 'var(--color-text-sub)' }}>
                {act.description}
              </div>
            </div>
            <button
              onClick={() => router.push(`/school/${schoolId}/class/${classId}/activity/${act.id}`)}
              className="text-sm px-3 py-1 rounded-lg"
              style={{ background: 'var(--color-surface)', color: 'var(--color-text-sub)' }}
            >
              보기
            </button>
          </div>
        ))}
      </div>

      {/* 한 해 마무리 — 기억창고로 */}
      <div className="rounded-3xl p-4 mb-4" style={{ background: 'var(--color-surface)' }}>
        <div className="text-sm font-black mb-1" style={{ color: 'var(--color-text-main)' }}>
          📦 한 해 마무리
        </div>
        <div className="text-[13px] mb-3 leading-relaxed" style={{ color: 'var(--color-text-sub)' }}>
          이 반을 기억창고로 옮겨요. 작품·활동·숙제가 그대로 담기고,
          졸업한 뒤에도 볼 수 있어요.
          <b> 아이들이 만든 건 지워지지 않아요</b> — 활성 목록에서만 빠집니다.
        </div>

        {confirmArchive ? (
          <div className="flex gap-2">
            <button
              onClick={() => setConfirmArchive(false)}
              className="flex-1 rounded-xl py-2.5 text-sm font-bold"
              style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-sub)' }}
            >
              그만두기
            </button>
            <button
              onClick={async () => {
                setArchiving(true); setArchiveMsg('');
                try {
                  const token = await auth?.currentUser?.getIdToken();
                  const res = await fetch('/api/archive', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ schoolId, classId }),
                  });
                  const json = await res.json();
                  if (!res.ok) throw new Error(json.error || '옮기지 못했어요');
                  setArchiveMsg(
                    `기억창고에 담았어요 — 작품 ${json.counts.artworks}개, 활동 ${json.counts.activities}개`
                  );
                  setConfirmArchive(false);
                } catch (e) {
                  setArchiveMsg((e as Error).message);
                }
                setArchiving(false);
              }}
              disabled={archiving}
              className="flex-1 rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-40"
              style={{ background: '#C9A87C' }}
            >
              {archiving ? '담는 중...' : '정말 옮기기'}
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmArchive(true)}
            className="w-full rounded-xl py-2.5 text-sm font-bold"
            style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-main)' }}
          >
            기억창고로 옮기기
          </button>
        )}

        {archiveMsg && (
          <div className="text-[13px] font-bold mt-2" style={{ color: 'var(--color-primary)' }}>
            {archiveMsg}
          </div>
        )}
      </div>

      {/* 활동 추가 모달 */}
      {showAddActivity && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setShowAddActivity(false); }}
        >
          <div
            className="mx-4 w-full max-w-[380px] rounded-2xl p-5"
            style={{ background: 'var(--color-surface)' }}
          >
            <h3 className="text-base font-bold mb-4" style={{ color: 'var(--color-text-main)' }}>
              새 활동 추가
            </h3>
            <div className="space-y-3 mb-4">
              <div>
                <label className="text-[12px] font-bold block mb-1" style={{ color: 'var(--color-text-sub)' }}>
                  활동 제목
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="예: 수채화 그리기"
                  className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                  style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-main)' }}
                />
              </div>
              <div>
                <label className="text-[12px] font-bold block mb-1" style={{ color: 'var(--color-text-sub)' }}>
                  설명
                </label>
                <textarea
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="활동에 대한 간단한 설명"
                  rows={2}
                  className="w-full rounded-xl px-3 py-2.5 text-sm outline-none resize-none"
                  style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-main)' }}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowAddActivity(false)}
                className="flex-1 rounded-xl py-2.5 text-sm font-bold"
                style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-sub)' }}
              >
                취소
              </button>
              <button
                onClick={handleAddActivity}
                disabled={!newTitle.trim()}
                className="flex-1 rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-40"
                style={{ background: 'var(--color-primary)' }}
              >
                추가
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
