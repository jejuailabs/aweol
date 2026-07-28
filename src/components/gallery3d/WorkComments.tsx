'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  addDoc, collection, deleteDoc, doc, getDocs, orderBy, query, serverTimestamp, updateDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { playSound } from '@/lib/sound';
import { backdropClose } from '@/lib/backdrop';
import { MAX_COMMENT, type WorkCommentDoc, type WorkDoc } from '@/lib/art-hall';

/**
 * 작품에 남긴 말 — **작은 창으로 본다.**
 *
 * 전시실 벽에는 숫자와 최신 한 줄만 띄운다. 남긴 말을 그림 옆에 다 늘어놓으면
 * **작품 비율이 깨진다** — 긴 글 하나에 그림이 밀려난다. 그래서 나머지는
 * 여기서 본다.
 *
 * **작가는 각 말에 답을 단다.** 답글에 또 답글이 달리는 나무 구조는 안 만든다 —
 * 전시실에서 오가는 말은 "잘 봤어요" 와 "고맙습니다" 두 마디로 끝나는 것이
 * 보통이라, 층을 깊게 하면 화면만 복잡해지고 아이는 못 읽는다.
 */

export type CommentRow = WorkCommentDoc & { id: string };

export default function WorkComments({
  hallId, showId, work, isOwner, rows, onClose, onChanged,
}: {
  hallId: string;
  showId: string;
  work: WorkDoc & { id: string };
  /** 전시관 주인인가 — 답을 달 수 있다 */
  isOwner: boolean;
  /** 이 작품에 달린 말 (바깥에서 한 번에 받아 나눠 준 것) */
  rows: CommentRow[];
  onClose: () => void;
  /** 남기거나 지운 뒤 — 바깥이 다시 받아 온다 */
  onChanged: () => void;
}) {
  const { user, userDoc } = useAuth();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  /** 지금 답을 달고 있는 말 */
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');

  const path = () => collection(db!, 'halls', hallId, 'shows', showId, 'comments');

  const send = async () => {
    const t = text.trim().slice(0, MAX_COMMENT);
    if (!t || !db || !user) return;
    setBusy('send'); setErr('');
    try {
      await addDoc(path(), {
        workId: work.id,
        authorUid: user.uid,
        authorName: userDoc?.displayName || '친구',
        text: t,
        createdAt: serverTimestamp(),
      });
      playSound('post');
      setText('');
      onChanged();
    } catch (e) {
      // 왜 막혔는지 그대로 — '못 남겼어요' 만으로는 아무도 못 고친다
      setErr(`남기지 못했어요 — ${(e as Error)?.message ?? e}`);
    }
    setBusy('');
  };

  const sendReply = async (id: string) => {
    const t = replyText.trim().slice(0, MAX_COMMENT);
    if (!t || !db) return;
    setBusy(id); setErr('');
    try {
      await updateDoc(doc(db, 'halls', hallId, 'shows', showId, 'comments', id), {
        reply: t,
        replyAt: serverTimestamp(),
      });
      playSound('post');
      setReplyTo(null);
      setReplyText('');
      onChanged();
    } catch (e) {
      setErr(`답을 달지 못했어요 — ${(e as Error)?.message ?? e}`);
    }
    setBusy('');
  };

  const remove = async (id: string) => {
    if (!db) return;
    setBusy(id); setErr('');
    try {
      await deleteDoc(doc(db, 'halls', hallId, 'shows', showId, 'comments', id));
      onChanged();
    } catch (e) {
      setErr(`지우지 못했어요 — ${(e as Error)?.message ?? e}`);
    }
    setBusy('');
  };

  return (
    <div
      className="fixed inset-0 z-[85] flex items-end sm:items-center justify-center px-4 py-6"
      style={{ background: 'rgba(16,14,12,0.62)' }}
      {...backdropClose(onClose)}
    >
      <div
        className="w-full max-w-[420px] rounded-3xl p-4 max-h-[86vh] flex flex-col"
        style={{ background: 'var(--color-bg)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-3 shrink-0">
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-black truncate" style={{ color: 'var(--color-text-main)' }}>
              💬 {work.title || '무제'}
            </div>
            <div className="text-[12px]" style={{ color: 'var(--color-text-sub)' }}>
              남긴 말 {rows.length}개
            </div>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 h-8 w-8 rounded-full text-sm"
            style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-sub)' }}
            aria-label="닫기"
          >
            ✕
          </button>
        </div>

        {err && (
          <div
            className="rounded-xl px-3 py-2 mb-2 text-[12px] font-bold shrink-0"
            style={{ background: '#FFF1E8', color: '#A6522A' }}
          >
            {err}
          </div>
        )}

        {/* 남긴 말들 — 최신이 위 */}
        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2">
          {rows.length === 0 ? (
            <div
              className="rounded-2xl py-8 text-center text-[13px]"
              style={{ background: 'var(--color-surface)', color: 'var(--color-text-sub)' }}
            >
              아직 남긴 말이 없어요.
              <br />
              처음으로 한마디 남겨보세요.
            </div>
          ) : rows.map((c) => (
            <div key={c.id} className="rounded-2xl p-3" style={{ background: 'var(--color-surface)' }}>
              <div className="flex items-center gap-1.5">
                <span className="text-[13px] font-black" style={{ color: 'var(--color-text-main)' }}>
                  {c.authorName}
                </span>
                <span className="ml-auto flex items-center gap-1.5">
                  {/* 내 말이거나 내 전시관이면 지울 수 있다 */}
                  {(user?.uid === c.authorUid || isOwner) && (
                    <button
                      onClick={() => remove(c.id)}
                      disabled={!!busy}
                      className="text-[11px] font-bold disabled:opacity-40"
                      style={{ color: '#C0392B' }}
                    >
                      지우기
                    </button>
                  )}
                </span>
              </div>
              <div
                className="text-[13px] leading-relaxed mt-1 whitespace-pre-line"
                style={{ color: 'var(--color-text-main)' }}
              >
                {c.text}
              </div>

              {/* 작가의 답 */}
              {c.reply && (
                <div
                  className="mt-2 rounded-xl px-3 py-2"
                  style={{ background: 'var(--color-surface-soft)' }}
                >
                  <div className="text-[11px] font-black mb-0.5" style={{ color: 'var(--color-primary)' }}>
                    ↳ 작가의 답
                  </div>
                  <div className="text-[13px] leading-relaxed whitespace-pre-line" style={{ color: 'var(--color-text-main)' }}>
                    {c.reply}
                  </div>
                </div>
              )}

              {/* 주인만 — 답 달기 */}
              {isOwner && !c.reply && (
                replyTo === c.id ? (
                  <div className="mt-2 flex gap-1.5">
                    <input
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value.slice(0, MAX_COMMENT))}
                      onKeyDown={(e) => { if (e.key === 'Enter') sendReply(c.id); }}
                      placeholder="답을 적어요"
                      autoFocus
                      className="flex-1 min-w-0 rounded-xl px-3 py-2 text-[13px] outline-none"
                      style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-main)' }}
                    />
                    <button
                      onClick={() => sendReply(c.id)}
                      disabled={!replyText.trim() || !!busy}
                      className="shrink-0 rounded-xl px-3 text-[12px] font-bold text-white disabled:opacity-40"
                      style={{ background: 'var(--color-primary)' }}
                    >
                      {busy === c.id ? '...' : '달기'}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setReplyTo(c.id); setReplyText(''); }}
                    className="mt-1.5 text-[12px] font-bold"
                    style={{ color: 'var(--color-primary)' }}
                  >
                    ↳ 답 달기
                  </button>
                )
              )}
            </div>
          ))}
        </div>

        {/* 남기기 */}
        <div className="shrink-0 pt-3">
          {user ? (
            <div className="flex gap-1.5">
              <input
                value={text}
                onChange={(e) => setText(e.target.value.slice(0, MAX_COMMENT))}
                onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
                placeholder="작품을 보고 든 생각을 남겨요"
                className="flex-1 min-w-0 rounded-xl px-3 py-2.5 text-[14px] outline-none"
                style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-main)' }}
              />
              <button
                onClick={send}
                disabled={!text.trim() || !!busy}
                className="shrink-0 rounded-xl px-4 text-[14px] font-bold text-white disabled:opacity-40"
                style={{ background: 'var(--color-primary)' }}
              >
                {busy === 'send' ? '...' : '남기기'}
              </button>
            </div>
          ) : (
            <div
              className="rounded-xl py-3 text-center text-[13px]"
              style={{ background: 'var(--color-surface)', color: 'var(--color-text-sub)' }}
            >
              로그인하면 한마디 남길 수 있어요
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * 한 전시의 말을 **한 번에** 받아 온다.
 *
 * 작품마다 따로 물으면 마흔 점이면 마흔 번이다. 전시 아래 한곳에 모아 두고
 * `workId` 로 나눠 붙인다.
 *
 * **안 읽은 것**은 이 기기에 적어 둔 '마지막으로 본 때' 와 견준다.
 * 서버에 사람마다 읽음 표시를 남기면 문서가 사람×작품만큼 늘어나는데,
 * 빨간 점 하나 띄우자고 치를 값이 아니다.
 */
export function useShowComments(hallId: string, showId: string) {
  const [rows, setRows] = useState<CommentRow[]>([]);
  const [seenAt, setSeenAt] = useState(0);
  const [tick, setTick] = useState(0);

  const key = `aewol.seen.${hallId}.${showId}`;

  useEffect(() => {
    try {
      setSeenAt(Number(localStorage.getItem(key)) || 0);
    } catch {}
  }, [key]);

  useEffect(() => {
    if (!db || !hallId || !showId) return;
    let alive = true;
    (async () => {
      try {
        const snap = await getDocs(
          query(collection(db!, 'halls', hallId, 'shows', showId, 'comments'),
            orderBy('createdAt', 'desc'))
        );
        if (!alive) return;
        setRows(snap.docs.map((d) => ({ id: d.id, ...(d.data() as WorkCommentDoc) })));
      } catch {
        if (alive) setRows([]);
      }
    })();
    return () => { alive = false; };
  }, [hallId, showId, tick]);

  /** 지금 본 것으로 친다 — 빨간 점이 사라진다 */
  const markSeen = useCallback(() => {
    const now = Date.now();
    setSeenAt(now);
    try { localStorage.setItem(key, String(now)); } catch {}
  }, [key]);

  /** 작품마다 개수·최신 한 줄·안 읽은 것 있나 */
  const talks = useCallback((): Record<string, { count: number; latest: string; isNew: boolean }> => {
    const out: Record<string, { count: number; latest: string; isNew: boolean }> = {};
    for (const c of rows) {
      const at = (c.createdAt as { toMillis?: () => number })?.toMillis?.() ?? 0;
      const cur = out[c.workId];
      if (!cur) {
        // 최신순으로 받아왔으므로 처음 만난 것이 가장 최근이다
        out[c.workId] = { count: 1, latest: c.text, isNew: at > seenAt };
      } else {
        cur.count += 1;
        if (at > seenAt) cur.isNew = true;
      }
    }
    return out;
  }, [rows, seenAt]);

  return {
    rows,
    talks: talks(),
    forWork: (workId: string) => rows.filter((c) => c.workId === workId),
    reload: () => setTick((n) => n + 1),
    markSeen,
  };
}
