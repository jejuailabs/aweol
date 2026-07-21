'use client';

import { useState, useEffect, useRef } from 'react';
import {
  collection, addDoc, onSnapshot, query, orderBy, serverTimestamp,
  doc, setDoc, deleteDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { playSound } from '@/lib/sound';
import { useAuth } from '@/lib/auth-context';
import { canWriteComment } from '@/lib/auth-helpers';
import { CommentDoc } from '@/lib/firestore-schema';

interface ArtworkData {
  id: string;
  title: string;
  artistName: string;
  imageUrl: string;
  type: 'flat' | 'sculpture';
  artistComment?: string;
}

interface Props {
  artwork: ArtworkData;
  collectionPath: string;
  onClose: () => void;
}

const ROLE_META: Record<string, { color: string; badge?: string }> = {
  teacher: { color: '#E8604C', badge: '선생님' },
  super_admin: { color: '#E8604C', badge: '선생님' },
  student: { color: '#3BAF9F', badge: undefined },
  parent: { color: '#4A90D9', badge: '학부모' },
};

export default function ArtworkDetailModal({ artwork, collectionPath, onClose }: Props) {
  const { user, userDoc, role } = useAuth();
  const [comments, setComments] = useState<(CommentDoc & { id: string })[]>([]);
  const [likeUids, setLikeUids] = useState<string[]>([]);
  const [showComments, setShowComments] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [sending, setSending] = useState(false);
  const commentsEndRef = useRef<HTMLDivElement>(null);

  // 댓글 실시간 구독
  useEffect(() => {
    if (!db) return;
    const commentsRef = collection(db, collectionPath, artwork.id, 'comments');
    const q = query(commentsRef, orderBy('createdAt', 'asc'));
    const unsub = onSnapshot(q, (snap) => {
      setComments(snap.docs.map((d) => ({ id: d.id, ...d.data() } as CommentDoc & { id: string })));
    });
    return () => unsub();
  }, [collectionPath, artwork.id]);

  // 좋아요 실시간 구독
  useEffect(() => {
    if (!db) return;
    const likesRef = collection(db, collectionPath, artwork.id, 'likes');
    const unsub = onSnapshot(likesRef, (snap) => {
      setLikeUids(snap.docs.map((d) => d.id));
    });
    return () => unsub();
  }, [collectionPath, artwork.id]);

  useEffect(() => {
    if (showComments) commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [comments.length, showComments]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const liked = !!user && likeUids.includes(user.uid);

  const toggleLike = async () => {
    if (!db) return;
    if (!user) { window.location.href = '/login'; return; }
    const likeRef = doc(db, collectionPath, artwork.id, 'likes', user.uid);
    if (liked) {
      await deleteDoc(likeRef);
    } else {
      await setDoc(likeRef, { createdAt: serverTimestamp() });
      playSound('like');
    }
  };

  const handleSend = async () => {
    if (!newComment.trim() || !db || !user || !userDoc) return;
    setSending(true);
    await addDoc(collection(db, collectionPath, artwork.id, 'comments'), {
      text: newComment.trim(),
      authorUid: user.uid,
      authorName: userDoc.displayName || '익명',
      authorRole: role || 'student',
      createdAt: serverTimestamp(),
    });
    setNewComment('');
    setSending(false);
    playSound('post');
  };

  return (
    <div
      className="modal-backdrop absolute inset-0 z-50 overflow-hidden"
      style={{
        background: 'radial-gradient(ellipse 70% 60% at 50% 40%, rgba(72,60,50,0.92) 0%, rgba(18,16,14,0.97) 70%)',
        backdropFilter: 'blur(8px)',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* 닫기 */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-30 flex h-10 w-10 items-center justify-center rounded-full text-base transition-all hover:scale-110"
        style={{ background: 'rgba(255,255,255,0.14)', color: '#EDE6DC', border: '1px solid rgba(255,255,255,0.2)' }}
      >
        ✕
      </button>

      {/* ===== 작품 스테이지 — 무조건 중앙 메인 ===== */}
      <div
        className="modal-card absolute inset-0 flex flex-col items-center justify-center px-5 pb-8 pt-10 overflow-y-auto"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <div className="flex flex-col items-center max-w-[560px] w-full my-auto">
          {/* 액자 */}
          <div className="relative w-full" style={{ filter: 'drop-shadow(0 22px 44px rgba(0,0,0,0.55))' }}>
            <div
              className="absolute -inset-12 -z-10 pointer-events-none"
              style={{ background: 'radial-gradient(ellipse 60% 55% at 50% 45%, rgba(255,232,190,0.2) 0%, transparent 70%)' }}
            />
            <div className="p-2.5 rounded-sm" style={{ background: 'linear-gradient(135deg, #6B4A2E 0%, #8A6440 48%, #5C3E26 100%)' }}>
              <div className="p-[3px]" style={{ background: 'linear-gradient(135deg, #E8C878 0%, #B8944E 50%, #E2BE6C 100%)' }}>
                <div className="p-3 sm:p-4" style={{ background: '#F7F2E8' }}>
                  <div
                    className="flex items-center justify-center overflow-hidden"
                    style={{ background: '#FFFDF8', minHeight: '180px', maxHeight: '52vh', boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.12)' }}
                  >
                    {artwork.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={artwork.imageUrl} alt={artwork.title} className="max-h-[52vh] w-full object-contain" />
                    ) : (
                      <div
                        className="flex w-full flex-col items-center justify-center gap-2.5 py-12"
                        style={{ background: 'repeating-linear-gradient(45deg, #FBF7EE 0px, #FBF7EE 14px, #F5EFE2 14px, #F5EFE2 28px)' }}
                      >
                        <span className="float-slow text-5xl">{artwork.type === 'sculpture' ? '🏺' : '🖼️'}</span>
                        <span className="text-[12px] tracking-widest font-semibold" style={{ color: '#A89880', letterSpacing: '0.2em' }}>
                          COMING SOON
                        </span>
                        <span className="text-sm" style={{ color: '#8B7B63' }}>작품이 곧 걸릴 예정이에요</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 작품 아래 — 명패: 작품명 / 작가명 / 유형 */}
          <div
            className="mt-4 rounded-xl px-6 py-3.5 text-center w-fit max-w-full"
            style={{
              background: 'linear-gradient(180deg, #FBF6EC 0%, #EFE6D4 100%)',
              boxShadow: '0 8px 20px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.8)',
              border: '1px solid #D8C9AC',
            }}
          >
            <div className="text-base font-black leading-tight" style={{ color: '#3A3226' }}>
              {artwork.title}
            </div>
            <div className="mt-1 flex items-center justify-center gap-2 text-[13px]" style={{ color: '#8B7B63' }}>
              <span className="font-semibold">{artwork.artistName}</span>
              <span style={{ opacity: 0.5 }}>·</span>
              <span>{artwork.type === 'sculpture' ? '조형 작품' : '회화 · 글'}</span>
            </div>
          </div>

          {/* 작가의 말 */}
          {artwork.artistComment && (
            <div className="mt-3.5 flex items-start gap-2.5 max-w-[460px] w-full justify-center px-2">
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold"
                style={{ background: '#3BAF9F', color: 'white', boxShadow: '0 4px 10px rgba(0,0,0,0.35)' }}
              >
                {artwork.artistName[0]}
              </div>
              <div
                className="rounded-2xl rounded-tl-sm px-4 py-2.5 text-[12.5px] leading-relaxed"
                style={{ background: 'rgba(255,255,255,0.94)', color: '#42392C', boxShadow: '0 6px 16px rgba(0,0,0,0.3)' }}
              >
                💬 {artwork.artistComment}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ===== 플로팅 버튼: 하트 + 댓글 말풍선 (숫자만) ===== */}
      <div className="absolute bottom-6 right-5 z-20 flex flex-col items-center gap-3">
        <button
          onClick={toggleLike}
          className="flex flex-col items-center justify-center h-14 w-14 rounded-full transition-transform hover:scale-110 active:scale-95"
          style={{
            background: liked ? '#FF6B81' : 'rgba(255,255,255,0.95)',
            boxShadow: '0 6px 16px rgba(0,0,0,0.35)',
            border: liked ? '2.5px solid #E8506A' : '2.5px solid #EFE3CB',
          }}
        >
          <span className="text-xl leading-none">{liked ? '❤️' : '🤍'}</span>
          <span className="text-[12px] font-black leading-tight" style={{ color: liked ? 'white' : '#8A7A5F' }}>
            {likeUids.length}
          </span>
        </button>

        {/* 말풍선 모양 댓글 버튼 — 숫자만 표시 */}
        <button
          onClick={() => setShowComments(true)}
          className="relative flex flex-col items-center justify-center h-14 w-14 transition-transform hover:scale-110 active:scale-95"
        >
          <div
            className="flex h-full w-full flex-col items-center justify-center rounded-2xl"
            style={{ background: 'rgba(255,255,255,0.95)', border: '2.5px solid #EFE3CB', boxShadow: '0 6px 16px rgba(0,0,0,0.35)' }}
          >
            <span className="text-lg leading-none">💬</span>
            <span className="text-[13px] font-black leading-tight" style={{ color: '#8A7A5F' }}>
              {comments.length}
            </span>
          </div>
          {/* 말풍선 꼬리 */}
          <div
            className="absolute -bottom-[7px] right-4 h-3.5 w-3.5 rotate-45"
            style={{ background: 'rgba(255,255,255,0.95)', borderRight: '2.5px solid #EFE3CB', borderBottom: '2.5px solid #EFE3CB' }}
          />
        </button>
      </div>

      {/* ===== 댓글 바텀시트 (누르면 열림) ===== */}
      {showComments && (
        <div
          className="absolute inset-0 z-40 flex items-end justify-center"
          style={{ background: 'rgba(0,0,0,0.35)' }}
          onClick={() => setShowComments(false)}
        >
          <div
            className="modal-card w-full sm:max-w-[520px] rounded-t-3xl flex flex-col"
            style={{ background: 'rgba(255,253,248,0.99)', maxHeight: '72vh', boxShadow: '0 -12px 40px rgba(0,0,0,0.4)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full" style={{ background: '#E6DCC8' }} />
            </div>
            <div className="flex items-center justify-between px-5 pb-3" style={{ borderBottom: '2px dashed #E6DCC8' }}>
              <div className="flex items-center gap-2">
                <span className="text-xl">✍️</span>
                <div>
                  <div className="text-sm font-black" style={{ color: '#3A3226' }}>관람 방명록</div>
                  <div className="text-[12px]" style={{ color: '#A89880' }}>
                    {comments.length > 0 ? `${comments.length}명이 감상평을 남겼어요` : '작품을 보고 느낀 점을 나눠요'}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setShowComments(false)}
                className="w-7 h-7 rounded-full text-sm"
                style={{ background: '#F1EADB', color: '#8B7B63' }}
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 min-h-[140px]">
              {comments.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-8 text-center">
                  <span className="float-slower text-3xl">🕊️</span>
                  <span className="text-[13px] leading-relaxed" style={{ color: '#A89880' }}>
                    아직 방명록이 비어 있어요.<br />첫 감상평의 주인공이 되어보세요!
                  </span>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {comments.map((c) => {
                    const meta = ROLE_META[c.authorRole] || { color: '#9CA3AF' };
                    return (
                      <div key={c.id} className="flex items-start gap-2.5">
                        <div
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[13px] font-bold text-white"
                          style={{ background: meta.color }}
                        >
                          {c.authorName[0]}
                        </div>
                        <div className="flex-1 rounded-2xl rounded-tl-sm px-3.5 py-2.5" style={{ background: '#F6F0E4' }}>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[13px] font-bold" style={{ color: '#3A3226' }}>{c.authorName}</span>
                            {meta.badge && (
                              <span className="rounded-full px-1.5 py-px text-[8px] font-bold text-white" style={{ background: meta.color }}>
                                {meta.badge}
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 text-[14px] leading-relaxed" style={{ color: '#54493A' }}>
                            {c.text}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={commentsEndRef} />
                </div>
              )}
            </div>

            <div className="px-4 pb-5 pt-2" style={{ borderTop: '2px dashed #E6DCC8' }}>
              {canWriteComment(role) ? (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleSend(); }}
                    placeholder="감상평을 남겨주세요..."
                    className="min-w-0 flex-1 rounded-full px-4 py-2.5 text-[14px] outline-none"
                    style={{ background: '#F1EADB', color: '#3A3226', border: '1px solid #E0D6C2' }}
                  />
                  <button
                    onClick={handleSend}
                    disabled={!newComment.trim() || sending}
                    className="shrink-0 rounded-full px-4 text-[14px] font-bold text-white transition-all hover:scale-105 disabled:opacity-40"
                    style={{ background: 'linear-gradient(135deg, #4FD886 0%, #2E9E56 100%)' }}
                  >
                    남기기
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => { window.location.href = '/login'; }}
                  className="w-full rounded-full py-3 text-[14px] font-bold"
                  style={{ background: '#F1EADB', color: '#8B7B63', border: '1px dashed #CFC2A8' }}
                >
                  🔑 로그인하고 감상평 남기기
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
