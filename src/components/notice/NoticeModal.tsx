'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  collection, query, orderBy, onSnapshot, addDoc, deleteDoc, doc, setDoc,
  serverTimestamp, getDocs,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { playSound } from '@/lib/sound';
import { useAuth } from '@/lib/auth-context';
import { isTeacherOfClass } from '@/lib/auth-helpers';
import { NoticeKind } from '@/lib/firestore-schema';
import { NOTICE_TABS } from '@/components/gallery3d/NoticeWall';
import HomeworkPanel from './HomeworkPanel';
import QuizPanel from './QuizPanel';
import SpotPanel from './SpotPanel';
import GamePanel from '@/components/game/GamePanel';


export interface NoticePost {
  id: string;
  kind: NoticeKind;
  title: string;
  body: string;
  forDate: string | null;
  authorName: string;
  createdAt: Date | null;
}

interface CommentRow {
  id: string;
  text: string;
  authorName: string;
  authorRole: string;
}

export default function NoticeModal({
  schoolId,
  classId,
  posts,
  initialKind,
  onClose,
}: {
  schoolId: string;
  classId: string;
  posts: NoticePost[];
  initialKind: NoticeKind;
  onClose: () => void;
}) {
  const { user, userDoc, role } = useAuth();
  const [kind, setKind] = useState<NoticeKind>(initialKind);
  const [openId, setOpenId] = useState<string | null>(null);
  const [likes, setLikes] = useState<string[]>([]);
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [newComment, setNewComment] = useState('');
  const [sending, setSending] = useState(false);

  // 교사 작성
  const [writing, setWriting] = useState(false);
  const [wTitle, setWTitle] = useState('');
  const [wBody, setWBody] = useState('');
  const [saving, setSaving] = useState(false);

  /**
   * **이 반** 담임만 낸다. `canManageClass` 는 어느 반인지를 안 보므로
   * 그걸로 열면 남의 반에서 버튼이 보이다가 눌렀을 때 거부당한다.
   */
  const isStaff = isTeacherOfClass(role, userDoc?.classIds, classId);
  const tab = NOTICE_TABS.find((t) => t.kind === kind)!;
  const list = posts.filter((p) => p.kind === kind);
  const openPost = list.find((p) => p.id === openId) || null;

  const basePath = `schools/${schoolId}/classes/${classId}/notices`;

  // 열린 글의 좋아요·댓글 구독
  useEffect(() => {
    if (!db || !openId) { setLikes([]); setComments([]); return; }
    const unsubLike = onSnapshot(collection(db, basePath, openId, 'likes'), (s) =>
      setLikes(s.docs.map((d) => d.id))
    );
    const unsubCmt = onSnapshot(
      query(collection(db, basePath, openId, 'comments'), orderBy('createdAt', 'asc')),
      (s) => setComments(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CommentRow, 'id'>) })))
    );
    return () => { unsubLike(); unsubCmt(); };
  }, [openId, basePath]);

  const liked = !!user && likes.includes(user.uid);

  const toggleLike = useCallback(async () => {
    if (!db || !openId) return;
    if (!user) { window.location.href = '/login'; return; }
    const ref = doc(db, basePath, openId, 'likes', user.uid);
    if (liked) await deleteDoc(ref);
    else { await setDoc(ref, { createdAt: serverTimestamp() }); playSound('like'); }
  }, [db, openId, user, liked, basePath]);

  const sendComment = useCallback(async () => {
    if (!db || !openId || !user || !userDoc || !newComment.trim()) return;
    setSending(true);
    await addDoc(collection(db, basePath, openId, 'comments'), {
      text: newComment.trim(),
      authorUid: user.uid,
      authorName: userDoc.displayName || '익명',
      authorRole: role || 'student',
      createdAt: serverTimestamp(),
    });
    setNewComment('');
    setSending(false);
    playSound('post');
  }, [db, openId, user, userDoc, role, newComment, basePath]);

  const createPost = useCallback(async () => {
    if (!db || !user || !userDoc || !wTitle.trim()) return;
    setSaving(true);
    await addDoc(collection(db, basePath), {
      kind,
      title: wTitle.trim(),
      body: wBody.trim(),
      forDate: kind === 'meal' ? new Date().toISOString().slice(0, 10) : null,
      authorUid: user.uid,
      authorName: userDoc.displayName || '선생님',
      createdAt: serverTimestamp(),
    });
    setWTitle(''); setWBody(''); setWriting(false); setSaving(false);
    playSound('post');
  }, [db, user, userDoc, wTitle, wBody, kind, basePath]);

  const removePost = useCallback(async (id: string) => {
    if (!db) return;
    // 하위 좋아요·댓글까지 정리
    for (const sub of ['likes', 'comments']) {
      const s = await getDocs(collection(db, basePath, id, sub));
      await Promise.all(s.docs.map((d) => deleteDoc(d.ref)));
    }
    await deleteDoc(doc(db, basePath, id));
    setOpenId(null);
  }, [db, basePath]);

  return (
    <div
      className="modal-backdrop absolute inset-0 z-50 flex items-center justify-center px-4 py-6"
      style={{ background: 'rgba(24, 20, 16, 0.55)', backdropFilter: 'blur(10px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="modal-card w-full max-w-[520px] rounded-[28px] overflow-hidden flex flex-col"
        style={{
          maxHeight: '88vh',
          background: 'rgba(255, 250, 240, 0.86)',
          backdropFilter: 'blur(18px)',
          border: '3px solid rgba(255,255,255,0.65)',
          boxShadow: '0 24px 60px rgba(0,0,0,0.4)',
        }}
      >
        {/* 헤더 */}
        <div
          className="px-5 pt-4 pb-3"
          style={{ background: `linear-gradient(135deg, ${tab.color}dd 0%, ${tab.color}99 100%)` }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-2xl">{tab.emoji}</span>
              <div>
                <div className="text-base font-black text-white">{tab.label}</div>
                <div className="text-[12px] text-white opacity-80">우리 반 알림판</div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full text-sm transition-transform hover:scale-110"
              style={{ background: 'rgba(255,255,255,0.3)', color: 'white' }}
            >
              ✕
            </button>
          </div>

          {/* 카테고리 탭 */}
          <div className="flex gap-1.5 mt-3 overflow-x-auto">
            {NOTICE_TABS.map((t) => (
              <button
                key={t.kind}
                onClick={() => { setKind(t.kind); setOpenId(null); setWriting(false); }}
                className="rounded-full px-3 py-1 text-[13px] font-bold whitespace-nowrap transition-all"
                style={{
                  background: kind === t.kind ? 'white' : 'rgba(255,255,255,0.25)',
                  color: kind === t.kind ? t.color : 'white',
                }}
              >
                {t.emoji} {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* 숙제는 출제·제출·검사가 얽혀 있어 전용 패널이 담당한다 */}
          {kind === 'homework' ? (
            <HomeworkPanel schoolId={schoolId} classId={classId} />
          ) : kind === 'quiz' ? (
            <QuizPanel schoolId={schoolId} classId={classId} />
          ) : kind === 'game' ? (
            <GamePanel schoolId={schoolId} classId={classId} />
          ) : kind === 'spot' ? (
            <SpotPanel schoolId={schoolId} classId={classId} />
          ) : openPost ? (
            <div>
              <button
                onClick={() => setOpenId(null)}
                className="text-[13px] font-bold mb-2.5"
                style={{ color: '#8A7A5F' }}
              >
                ← 목록으로
              </button>
              <div
                className="rounded-2xl p-4 mb-3"
                style={{ background: 'rgba(255,255,255,0.8)', border: '1px solid rgba(0,0,0,0.05)' }}
              >
                <div className="text-base font-black mb-1" style={{ color: '#3A3226' }}>
                  {openPost.title}
                </div>
                <div className="text-[12px] mb-2.5" style={{ color: '#A89880' }}>
                  {openPost.authorName}
                  {openPost.createdAt && ` · ${openPost.createdAt.toLocaleDateString('ko-KR')}`}
                </div>
                {openPost.body && (
                  <div className="text-[15px] leading-relaxed whitespace-pre-wrap" style={{ color: '#54493A' }}>
                    {openPost.body}
                  </div>
                )}
              </div>

              {/* 좋아요 */}
              <div className="flex items-center gap-2 mb-3">
                <button
                  onClick={toggleLike}
                  className="flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold transition-transform hover:scale-105 active:scale-95"
                  style={{
                    background: liked ? '#FF6B81' : 'rgba(255,255,255,0.85)',
                    color: liked ? 'white' : '#8A7A5F',
                    border: '2px solid ' + (liked ? '#E8506A' : '#EFE3CB'),
                  }}
                >
                  {liked ? '❤️' : '🤍'} {likes.length}
                </button>
                {isStaff && (
                  <button
                    onClick={() => removePost(openPost.id)}
                    className="ml-auto rounded-full px-3 py-1.5 text-[13px] font-bold"
                    style={{ background: 'rgba(232,96,76,0.15)', color: '#E8604C' }}
                  >
                    삭제
                  </button>
                )}
              </div>

              {/* 댓글 */}
              <div className="text-[13px] font-bold mb-2" style={{ color: '#8A7A5F' }}>
                💬 댓글 {comments.length}
              </div>
              <div className="flex flex-col gap-2 mb-3">
                {comments.length === 0 && (
                  <div className="text-[13px] py-3 text-center" style={{ color: '#A89880' }}>
                    아직 댓글이 없어요
                  </div>
                )}
                {comments.map((c) => (
                  <div
                    key={c.id}
                    className="rounded-2xl px-3.5 py-2.5"
                    style={{ background: 'rgba(255,255,255,0.75)' }}
                  >
                    <div className="text-[13px] font-bold" style={{ color: '#3A3226' }}>
                      {c.authorName}
                      {(c.authorRole === 'teacher' || c.authorRole === 'school_admin' || c.authorRole === 'super_admin') && (
                        <span className="ml-1.5 rounded-full px-1.5 py-px text-[8px] text-white" style={{ background: '#E8604C' }}>
                          선생님
                        </span>
                      )}
                    </div>
                    <div className="text-[14px] mt-0.5" style={{ color: '#54493A' }}>{c.text}</div>
                  </div>
                ))}
              </div>

              {user ? (
                <div className="flex gap-2">
                  <input
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) sendComment(); }}
                    placeholder="댓글을 남겨보세요"
                    className="min-w-0 flex-1 rounded-full px-4 py-2.5 text-[14px] outline-none"
                    style={{ background: 'rgba(255,255,255,0.9)', color: '#3A3226', border: '1px solid #E0D6C2' }}
                  />
                  <button
                    onClick={sendComment}
                    disabled={!newComment.trim() || sending}
                    className="shrink-0 rounded-full px-4 text-[14px] font-bold text-white disabled:opacity-40"
                    style={{ background: 'var(--color-primary)' }}
                  >
                    남기기
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => { window.location.href = '/login'; }}
                  className="w-full rounded-full py-2.5 text-[14px] font-bold"
                  style={{ background: 'rgba(255,255,255,0.7)', color: '#8A7A5F', border: '1px dashed #CFC2A8' }}
                >
                  🔑 로그인하면 좋아요와 댓글을 남길 수 있어요
                </button>
              )}
            </div>
          ) : writing ? (
            /* 교사 작성 */
            <div>
              <div className="text-sm font-black mb-3" style={{ color: '#3A3226' }}>
                {tab.emoji} {tab.label} 올리기
              </div>
              <input
                value={wTitle}
                onChange={(e) => setWTitle(e.target.value)}
                placeholder={kind === 'meal' ? '예: 오늘의 급식' : '제목'}
                className="w-full rounded-xl px-3 py-2.5 text-sm outline-none mb-2"
                style={{ background: 'rgba(255,255,255,0.9)', color: '#3A3226' }}
              />
              <textarea
                value={wBody}
                onChange={(e) => setWBody(e.target.value)}
                rows={5}
                placeholder={kind === 'meal' ? '예: 백미밥, 미역국, 불고기, 김치, 요구르트' : '내용'}
                className="w-full rounded-xl px-3 py-2.5 text-sm outline-none resize-none mb-3"
                style={{ background: 'rgba(255,255,255,0.9)', color: '#3A3226' }}
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setWriting(false)}
                  className="flex-1 rounded-xl py-2.5 text-sm font-bold"
                  style={{ background: 'rgba(255,255,255,0.7)', color: '#8A7A5F' }}
                >
                  취소
                </button>
                <button
                  onClick={createPost}
                  disabled={!wTitle.trim() || saving}
                  className="flex-1 rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-40"
                  style={{ background: tab.color }}
                >
                  {saving ? '올리는 중...' : '올리기'}
                </button>
              </div>
            </div>
          ) : (
            /* 목록 */
            <>
              {isStaff && (
                <button
                  onClick={() => setWriting(true)}
                  className="w-full rounded-2xl py-3 mb-3 text-sm font-bold border-2 border-dashed"
                  style={{ borderColor: tab.color + '80', color: tab.color }}
                >
                  + 새 {tab.label} 올리기
                </button>
              )}

              {list.length === 0 ? (
                <div className="py-10 text-center">
                  <div className="text-4xl mb-2">{tab.emoji}</div>
                  <div className="text-sm" style={{ color: '#A89880' }}>
                    아직 올라온 {tab.label}이 없어요
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {list.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setOpenId(p.id)}
                      className="rounded-2xl p-3.5 text-left transition-transform hover:scale-[1.01]"
                      style={{ background: 'rgba(255,255,255,0.8)', border: '1px solid rgba(0,0,0,0.05)' }}
                    >
                      <div className="text-sm font-bold" style={{ color: '#3A3226' }}>{p.title}</div>
                      {p.body && (
                        <div
                          className="text-[13px] mt-0.5 leading-snug overflow-hidden"
                          style={{ color: '#8A7A5F', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}
                        >
                          {p.body}
                        </div>
                      )}
                      <div className="text-[12px] mt-1.5" style={{ color: '#A89880' }}>
                        {p.authorName}
                        {p.createdAt && ` · ${p.createdAt.toLocaleDateString('ko-KR')}`}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
