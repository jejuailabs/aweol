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

  const roleColors: Record<string, string> = {
    teacher: '#FF6B6B',
    super_admin: '#FF6B6B',
    student: '#4ECDC4',
    parent: '#45B7D1',
  };

  return (
    <div
      className="absolute inset-0 z-50 flex items-end justify-center"
      style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-[480px] rounded-t-3xl shadow-2xl flex flex-col"
        style={{ background: 'var(--color-surface)', maxHeight: '75vh' }}
      >
        {/* 핸들 바 */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full" style={{ background: 'var(--color-surface-soft)' }} />
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-4">
          {/* 헤더 */}
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold" style={{ color: 'var(--color-text-main)' }}>
              {artwork.title}
            </h3>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full text-sm"
              style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-sub)' }}
            >
              ✕
            </button>
          </div>

          {/* 작가 정보 */}
          <div className="flex items-center gap-2 mb-4">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold"
              style={{ background: '#4ECDC4', color: 'white' }}
            >
              {artwork.artistName[0]}
            </div>
            <div>
              <div className="text-sm font-bold" style={{ color: 'var(--color-text-main)' }}>
                {artwork.artistName}
              </div>
              <div className="text-[10px]" style={{ color: 'var(--color-text-sub)' }}>작가</div>
            </div>
          </div>

          {/* 작품 이미지 */}
          <div
            className="w-full aspect-[4/3] rounded-2xl mb-3 flex items-center justify-center overflow-hidden"
            style={{ background: 'var(--color-surface-soft)' }}
          >
            {artwork.imageUrl ? (
              <img src={artwork.imageUrl} alt={artwork.title} className="w-full h-full object-contain" />
            ) : (
              <div className="flex flex-col items-center gap-2">
                <span className="text-5xl">{artwork.type === 'sculpture' ? '🏺' : '🎨'}</span>
                <span className="text-xs" style={{ color: 'var(--color-text-sub)' }}>작품 이미지 준비 중</span>
              </div>
            )}
          </div>

          {/* 작가의 말 */}
          {artwork.artistComment && (
            <div
              className="rounded-xl px-4 py-3 mb-4 text-sm"
              style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-main)' }}
            >
              <div className="text-[10px] font-bold mb-1" style={{ color: 'var(--color-text-sub)' }}>
                작가의 말
              </div>
              &ldquo;{artwork.artistComment}&rdquo;
            </div>
          )}

          {/* 댓글 영역 */}
          <div className="border-t pt-4" style={{ borderColor: 'var(--color-surface-soft)' }}>
            <h4 className="text-sm font-bold mb-3" style={{ color: 'var(--color-text-main)' }}>
              댓글 {comments.length > 0 && `(${comments.length})`}
            </h4>

            {comments.length === 0 ? (
              <div className="text-xs text-center py-4" style={{ color: 'var(--color-text-sub)' }}>
                아직 댓글이 없어요. 첫 댓글을 남겨보세요!
              </div>
            ) : (
              <div className="flex flex-col gap-3 mb-3">
                {comments.map((c) => (
                  <div key={c.id} className="flex gap-2">
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                      style={{ background: roleColors[c.authorRole] || '#ccc', color: 'white' }}
                    >
                      {c.authorName[0]}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold" style={{ color: 'var(--color-text-main)' }}>
                          {c.authorName}
                        </span>
                        {(c.authorRole === 'teacher' || c.authorRole === 'super_admin') && (
                          <span
                            className="text-[9px] px-1.5 py-0.5 rounded-full font-bold"
                            style={{ background: '#FF6B6B20', color: '#FF6B6B' }}
                          >
                            선생님
                          </span>
                        )}
                      </div>
                      <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-main)' }}>
                        {c.text}
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={commentsEndRef} />
              </div>
            )}
          </div>
        </div>

        {/* 댓글 입력 (로그인 사용자만) */}
        <div className="px-5 pb-5 pt-2 border-t" style={{ borderColor: 'var(--color-surface-soft)' }}>
          {canWriteComment(role) ? (
            <div className="flex gap-2">
              <input
                type="text"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleSend(); }}
                placeholder="댓글을 입력하세요..."
                className="flex-1 rounded-xl px-3 py-2.5 text-sm outline-none"
                style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-main)' }}
              />
              <button
                onClick={handleSend}
                disabled={!newComment.trim() || sending}
                className="rounded-xl px-4 py-2.5 text-sm font-bold text-white transition-opacity disabled:opacity-40"
                style={{ background: 'var(--color-primary)' }}
              >
                전송
              </button>
            </div>
          ) : (
            <button
              onClick={() => { window.location.href = '/login'; }}
              className="w-full rounded-xl py-3 text-sm font-bold text-center"
              style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-sub)' }}
            >
              로그인하면 댓글을 남길 수 있어요
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
