'use client';

import { useState, useEffect, useRef } from 'react';
import { collection, addDoc, onSnapshot, query, orderBy, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
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
  const [newComment, setNewComment] = useState('');
  const [sending, setSending] = useState(false);
  const commentsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!db) return;
    const commentsRef = collection(db, collectionPath, artwork.id, 'comments');
    const q = query(commentsRef, orderBy('createdAt', 'asc'));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as CommentDoc & { id: string }));
      setComments(list);
    });
    return () => unsub();
  }, [collectionPath, artwork.id]);

  useEffect(() => {
    commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [comments.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleSend = async () => {
    if (!newComment.trim() || !db || !user || !userDoc) return;
    setSending(true);
    const commentsRef = collection(db, collectionPath, artwork.id, 'comments');
    await addDoc(commentsRef, {
      text: newComment.trim(),
      authorUid: user.uid,
      authorName: userDoc.displayName || '익명',
      authorRole: role || 'student',
      createdAt: serverTimestamp(),
    });
    setNewComment('');
    setSending(false);
  };

  return (
    <div
      className="modal-backdrop absolute inset-0 z-50 flex items-center justify-center p-4 sm:p-8"
      style={{
        background: 'radial-gradient(ellipse 70% 60% at 50% 38%, rgba(72,60,50,0.92) 0%, rgba(18,16,14,0.97) 70%)',
        backdropFilter: 'blur(8px)',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* 닫기 */}
      <button
        onClick={onClose}
        className="absolute top-5 right-5 z-20 flex h-10 w-10 items-center justify-center rounded-full text-base transition-all hover:scale-110 hover:rotate-90"
        style={{ background: 'rgba(255,255,255,0.12)', color: '#EDE6DC', border: '1px solid rgba(255,255,255,0.18)' }}
      >
        ✕
      </button>

      <div
        className="modal-card flex w-full max-w-[980px] max-h-[92vh] flex-col sm:flex-row gap-5 sm:gap-8 overflow-y-auto sm:overflow-visible"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ================= 작품 스테이지 ================= */}
        <div className="flex flex-1 flex-col items-center justify-center min-h-0 py-2">
          {/* 액자 */}
          <div
            className="relative w-full max-w-[520px]"
            style={{ filter: 'drop-shadow(0 24px 50px rgba(0,0,0,0.55))' }}
          >
            {/* 스포트라이트 */}
            <div
              className="absolute -inset-14 -z-10 pointer-events-none"
              style={{ background: 'radial-gradient(ellipse 60% 55% at 50% 45%, rgba(255,232,190,0.22) 0%, transparent 70%)' }}
            />
            <div
              className="p-2.5 sm:p-3 rounded-sm"
              style={{ background: 'linear-gradient(135deg, #6B4A2E 0%, #8A6440 48%, #5C3E26 100%)' }}
            >
              <div className="p-[3px]" style={{ background: 'linear-gradient(135deg, #E8C878 0%, #B8944E 50%, #E2BE6C 100%)' }}>
                <div className="p-3 sm:p-5" style={{ background: '#F7F2E8' }}>
                  <div
                    className="relative flex items-center justify-center overflow-hidden"
                    style={{ background: '#FFFDF8', minHeight: '220px', maxHeight: '48vh', boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.12)' }}
                  >
                    {artwork.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={artwork.imageUrl}
                        alt={artwork.title}
                        className="max-h-[48vh] w-full object-contain"
                      />
                    ) : (
                      <div
                        className="flex w-full flex-col items-center justify-center gap-3 py-14"
                        style={{ background: 'repeating-linear-gradient(45deg, #FBF7EE 0px, #FBF7EE 14px, #F5EFE2 14px, #F5EFE2 28px)' }}
                      >
                        <span className="float-slow text-6xl">{artwork.type === 'sculpture' ? '🏺' : '🖼️'}</span>
                        <span className="text-[11px] tracking-widest font-semibold" style={{ color: '#A89880', letterSpacing: '0.2em' }}>
                          COMING SOON
                        </span>
                        <span className="text-xs" style={{ color: '#8B7B63' }}>작품이 곧 걸릴 예정이에요</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 미술관 명패 */}
          <div
            className="mt-4 sm:mt-5 rounded-lg px-6 py-3.5 text-center max-w-[420px] w-fit"
            style={{
              background: 'linear-gradient(180deg, #FBF6EC 0%, #EFE6D4 100%)',
              boxShadow: '0 8px 20px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.8)',
              border: '1px solid #D8C9AC',
            }}
          >
            <div className="text-[15px] font-black leading-tight" style={{ color: '#3A3226' }}>
              {artwork.title}
            </div>
            <div className="mt-1 flex items-center justify-center gap-2 text-[11px]" style={{ color: '#8B7B63' }}>
              <span className="font-semibold">{artwork.artistName}</span>
              <span style={{ opacity: 0.5 }}>·</span>
              <span>{artwork.type === 'sculpture' ? '조형 작품' : '회화 · 글'}</span>
            </div>
          </div>

          {/* 작가의 말 — 말풍선 */}
          {artwork.artistComment && (
            <div className="mt-4 flex items-start gap-2.5 max-w-[440px] px-2">
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold"
                style={{ background: '#3BAF9F', color: 'white', boxShadow: '0 4px 10px rgba(0,0,0,0.35)' }}
              >
                {artwork.artistName[0]}
              </div>
              <div
                className="relative rounded-2xl rounded-tl-sm px-4 py-3 text-[13px] leading-relaxed"
                style={{ background: 'rgba(255,255,255,0.94)', color: '#42392C', boxShadow: '0 6px 16px rgba(0,0,0,0.3)' }}
              >
                <span className="mr-1">💬</span>
                {artwork.artistComment}
              </div>
            </div>
          )}
        </div>

        {/* ================= 방명록 ================= */}
        <div
          className="flex w-full sm:w-[320px] shrink-0 flex-col rounded-3xl overflow-hidden self-stretch sm:max-h-[80vh]"
          style={{ background: 'rgba(255,253,248,0.97)', boxShadow: '0 20px 46px rgba(0,0,0,0.45)' }}
        >
          {/* 헤더 */}
          <div
            className="px-5 pt-5 pb-4"
            style={{ borderBottom: '2px dashed #E6DCC8' }}
          >
            <div className="flex items-center gap-2">
              <span className="text-xl">✍️</span>
              <div>
                <div className="text-sm font-black" style={{ color: '#3A3226' }}>관람 방명록</div>
                <div className="text-[10px]" style={{ color: '#A89880' }}>
                  {comments.length > 0 ? `${comments.length}명이 감상평을 남겼어요` : '작품을 보고 느낀 점을 나눠요'}
                </div>
              </div>
            </div>
          </div>

          {/* 댓글 리스트 */}
          <div className="flex-1 overflow-y-auto px-4 py-4 min-h-[120px]">
            {comments.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <span className="float-slower text-3xl">🕊️</span>
                <span className="text-[11px] leading-relaxed" style={{ color: '#A89880' }}>
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
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                        style={{ background: meta.color }}
                      >
                        {c.authorName[0]}
                      </div>
                      <div
                        className="flex-1 rounded-2xl rounded-tl-sm px-3.5 py-2.5"
                        style={{ background: '#F6F0E4' }}
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] font-bold" style={{ color: '#3A3226' }}>{c.authorName}</span>
                          {meta.badge && (
                            <span
                              className="rounded-full px-1.5 py-px text-[8px] font-bold text-white"
                              style={{ background: meta.color }}
                            >
                              {meta.badge}
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 text-[12px] leading-relaxed" style={{ color: '#54493A' }}>
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

          {/* 입력 */}
          <div className="px-4 pb-4 pt-2" style={{ borderTop: '2px dashed #E6DCC8' }}>
            {canWriteComment(role) ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleSend(); }}
                  placeholder="감상평을 남겨주세요..."
                  className="min-w-0 flex-1 rounded-full px-4 py-2.5 text-[12px] outline-none transition-shadow focus:shadow-md"
                  style={{ background: '#F1EADB', color: '#3A3226', border: '1px solid #E0D6C2' }}
                />
                <button
                  onClick={handleSend}
                  disabled={!newComment.trim() || sending}
                  className="shrink-0 rounded-full px-4 text-[12px] font-bold text-white transition-all hover:scale-105 disabled:opacity-40 disabled:hover:scale-100"
                  style={{ background: 'linear-gradient(135deg, #4FD886 0%, #2E9E56 100%)', boxShadow: '0 4px 12px rgba(62,196,109,0.4)' }}
                >
                  남기기
                </button>
              </div>
            ) : (
              <button
                onClick={() => { window.location.href = '/login'; }}
                className="w-full rounded-full py-3 text-[12px] font-bold transition-transform hover:scale-[1.02]"
                style={{ background: '#F1EADB', color: '#8B7B63', border: '1px dashed #CFC2A8' }}
              >
                🔑 로그인하고 감상평 남기기
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
