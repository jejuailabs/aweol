'use client';

import { useState } from 'react';
import { auth } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { playSound } from '@/lib/sound';
import type { BoardItem } from './Blackboard';

/**
 * 칠판에 쓴 것 목록 — 골라서 지운다.
 *
 * 전에는 담임의 '전체 지우기' 밖에 없었다. 아이가 한 글자 잘못 쓰면
 * 선생님께 부탁해 **반 전체 칠판을 날리는** 수밖에 없었다.
 *
 * 칠판 그림 위에서 직접 고르게 하지 않은 이유: 낙서는 선 뭉치라 어디를 눌러야
 * 그게 잡히는지 알 수 없고, 겹쳐 있으면 더 그렇다. 목록이 확실하다.
 */
export default function BlackboardList({
  schoolId, classId, items, canClearAll, onChanged, onClose,
}: {
  schoolId: string;
  classId: string;
  items: (BoardItem & { authorUid?: string })[];
  /** 담임인가 — 전체 지우기와 남의 글 지우기가 열린다 */
  canClearAll: boolean;
  onChanged: () => void;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');

  const removeOne = async (id: string) => {
    setBusy(id); setErr('');
    try {
      const token = await auth?.currentUser?.getIdToken();
      const res = await fetch(
        `/api/blackboard?schoolId=${schoolId}&classId=${classId}&itemId=${id}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${token ?? ''}` } }
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErr(j.error || '지우지 못했어요.');
        return;
      }
      playSound('close');
      onChanged();
    } catch {
      setErr('지우지 못했어요.');
    } finally {
      setBusy('');
    }
  };

  const clearAll = async () => {
    setBusy('all'); setErr('');
    try {
      const token = await auth?.currentUser?.getIdToken();
      const res = await fetch(
        `/api/blackboard?schoolId=${schoolId}&classId=${classId}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${token ?? ''}` } }
      );
      if (!res.ok) { setErr('지우지 못했어요.'); return; }
      onChanged();
      onClose();
    } catch {
      setErr('지우지 못했어요.');
    } finally {
      setBusy('');
    }
  };

  /** 내가 지울 수 있는가 — 본인 것이거나 담임이거나 */
  const canRemove = (it: BoardItem & { authorUid?: string }) =>
    !!user && (it.authorUid === user.uid || canClearAll);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center px-4 py-6"
      style={{ background: 'rgba(24,20,16,0.5)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-[420px] rounded-3xl p-4 max-h-[80vh] overflow-y-auto"
        style={{ background: '#FAF5EA' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-3">
          <div className="text-[15px] font-black shrink-0" style={{ color: '#3A3226' }}>
            🧽 칠판 정리
          </div>
          <button
            onClick={onClose}
            className="ml-auto shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-bold"
            style={{ background: 'rgba(0,0,0,0.06)', color: '#8A7A5F' }}
          >
            닫기
          </button>
        </div>

        {items.length === 0 ? (
          <div className="rounded-2xl p-6 text-center text-[14px]" style={{ background: 'white', color: '#8A7A5F' }}>
            칠판이 비어 있어요.
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {/* 최근 것이 위로 — 방금 잘못 쓴 걸 찾으러 오는 경우가 대부분이다 */}
            {[...items].reverse().map((it) => {
              const mine = !!user && it.authorUid === user.uid;
              return (
                <div
                  key={it.id}
                  className="flex items-center gap-2 rounded-2xl px-3 py-2.5"
                  style={mine ? { background: '#FFF1D6' } : { background: 'white' }}
                >
                  <span className="text-[16px] shrink-0">{it.kind === 'text' ? '💬' : '✏️'}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-bold truncate" style={{ color: '#3A3226' }}>
                      {it.kind === 'text' ? it.text : '낙서'}
                    </div>
                    <div className="text-[12px]" style={{ color: '#A89880' }}>
                      {it.authorName}{mine && ' (나)'}
                    </div>
                  </div>
                  {canRemove(it) ? (
                    <button
                      onClick={() => removeOne(it.id)}
                      disabled={!!busy}
                      className="shrink-0 rounded-xl px-3 py-1.5 text-[13px] font-bold disabled:opacity-40"
                      style={{ background: '#FDECEA', color: '#B02A37' }}
                    >
                      {busy === it.id ? '...' : '지우기'}
                    </button>
                  ) : (
                    <span className="shrink-0 text-[12px]" style={{ color: '#C4B79E' }}>
                      친구 것
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {err && (
          <div className="rounded-xl px-3 py-2.5 mt-2 text-[13px] font-bold" style={{ background: '#FDECEA', color: '#B02A37' }}>
            ⚠️ {err}
          </div>
        )}

        {canClearAll && items.length > 0 && (
          <button
            onClick={clearAll}
            disabled={!!busy}
            className="w-full mt-3 rounded-xl py-2.5 text-[13px] font-bold disabled:opacity-40"
            style={{ background: 'transparent', color: '#C0392B', border: '1px solid #F0C4BE' }}
          >
            {busy === 'all' ? '지우는 중...' : `🧹 전부 지우기 (${items.length}개)`}
          </button>
        )}

        {!canClearAll && (
          <p className="text-[12px] mt-2.5 leading-relaxed" style={{ color: '#A89880' }}>
            내가 쓴 것만 지울 수 있어요. 친구 것은 선생님께 말씀드려요.
          </p>
        )}
      </div>
    </div>
  );
}
