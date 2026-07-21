'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { isTeacherOfClass } from '@/lib/auth-helpers';
import { stagePlaysPath, stagesPath } from '@/lib/paths';
import { MAX_PAIRS, parsePairs, type WordPair } from '@/lib/wordset';
import MatchGame from './MatchGame';

interface Stage {
  id: string;
  order: number;
  title: string;
  pairs: WordPair[];
  source: 'manual' | 'ai';
  approved: boolean;
}

/**
 * 스테이지 — 한 반이 한 해 동안 쌓아가는 게임 재료.
 *
 * 스테이지 하나가 그날 배운 것 한 묶음이다. 지우지 않고 쌓아두면
 * 나중에 '복습' 으로 지난 것을 다시 꺼내 놀 수 있다.
 */
export default function StagePanel({ schoolId, classId }: { schoolId: string; classId: string }) {
  const { user, userDoc, role } = useAuth();
  const isStaff = isTeacherOfClass(role, userDoc?.classIds, classId);

  const [stages, setStages] = useState<Stage[]>([]);
  const [playing, setPlaying] = useState<Stage | null>(null);
  const [writing, setWriting] = useState(false);
  const [title, setTitle] = useState('');
  const [raw, setRaw] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const base = stagesPath(schoolId, classId);

  useEffect(() => {
    if (!db) return;
    return onSnapshot(
      query(collection(db, base), orderBy('order', 'desc')),
      (snap) => setStages(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Stage, 'id'>) }))),
      () => setStages([])
    );
  }, [base]);

  /** 붙여넣는 즉시 몇 개가 잡히는지 보여준다 — 저장하고 나서 알면 늦다 */
  const parsed = useMemo(() => parsePairs(raw), [raw]);

  /** 아이에게는 선생님이 확인한 것만 보인다 */
  const visible = isStaff ? stages : stages.filter((s) => s.approved);

  const save = async () => {
    if (!db || !user || !userDoc || parsed.pairs.length < 2) return;
    setSaving(true); setErr('');
    try {
      const nextOrder = (stages[0]?.order ?? 0) + 1;
      await addDoc(collection(db, base), {
        order: nextOrder,
        title: title.trim() || `${nextOrder}번째 스테이지`,
        pairs: parsed.pairs,
        source: 'manual',
        // 선생님이 직접 적은 것이니 바로 열어준다 (AI 가 만든 건 다르다)
        approved: true,
        authorUid: user.uid,
        authorName: userDoc.displayName || '선생님',
        createdAt: serverTimestamp(),
      });
      setTitle(''); setRaw(''); setWriting(false);
    } catch {
      setErr(
        isStaff
          ? '스테이지를 만들지 못했어요. 잠시 뒤 다시 해주세요.'
          : '내가 맡은 반이 아니라 만들 수 없어요.'
      );
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!db) return;
    try {
      await deleteDoc(doc(db, base, id));
    } catch {
      setErr('지우지 못했어요.');
    }
  };

  /** 아이가 한 판 끝냈다. 기록은 남기되, 실패해도 게임을 막지는 않는다. */
  const record = async (stage: Stage, r: { flips: number; score: number }) => {
    if (!db || !user || !userDoc) return;
    try {
      await addDoc(collection(db, stagePlaysPath(schoolId, classId, stage.id)), {
        studentUid: user.uid,
        studentName: userDoc.displayName || '친구',
        game: 'match',
        flips: r.flips,
        score: r.score,
        playedAt: serverTimestamp(),
      });
    } catch {
      // 기록이 안 남아도 아이가 논 건 논 것이다. 조용히 넘어간다.
    }
  };

  if (playing) {
    return (
      <MatchGame
        pairs={playing.pairs}
        /*
          판 배치는 스테이지마다 정해진다. 새로고침으로 쉬운 배치를 고를 수 없고,
          친구와 같은 판을 봐서 '나는 몇 번 만에 했다' 를 견줄 수 있다.
        */
        seed={playing.order * 7919 + playing.pairs.length}
        onDone={(r) => record(playing, r)}
        onExit={() => setPlaying(null)}
      />
    );
  }

  return (
    <div>
      {isStaff && !writing && (
        <button
          onClick={() => setWriting(true)}
          className="w-full rounded-xl py-3 mb-3 text-[14px] font-bold text-white"
          style={{ background: 'var(--color-primary)' }}
        >
          ＋ 새 스테이지 만들기
        </button>
      )}

      {isStaff && writing && (
        <div className="rounded-2xl p-4 mb-3" style={{ background: 'rgba(255,255,255,0.85)' }}>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="스테이지 이름 (예: 3단원 낱말)"
            className="w-full rounded-xl px-3 py-2.5 mb-2 text-[15px] outline-none"
            style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-main)' }}
          />
          <textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            rows={6}
            placeholder={'한 줄에 하나씩 적어주세요\n광합성=빛으로 양분을 만드는 일\n증산작용=물이 잎에서 빠져나가는 일'}
            className="w-full rounded-xl px-3 py-2.5 mb-2 text-[14px] outline-none leading-relaxed"
            style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-main)' }}
          />

          {/* 붙여넣자마자 몇 개가 잡혔는지 보여준다 */}
          <div className="text-[13px] font-bold mb-1" style={{ color: parsed.pairs.length >= 2 ? '#2E8B57' : '#8A7A5F' }}>
            {parsed.pairs.length}개 잡았어요 {parsed.pairs.length < 2 && '(2개 이상 필요해요)'}
          </div>
          {/* 잘못된 줄은 버리지 않고 알려준다 — 10개 넣었는데 7개만 나오면 이유를 알아야 한다 */}
          {parsed.problems.slice(0, 4).map((p) => (
            <div key={p} className="text-[12px] leading-relaxed" style={{ color: '#C0392B' }}>• {p}</div>
          ))}
          {parsed.problems.length > 4 && (
            <div className="text-[12px]" style={{ color: '#C0392B' }}>… 외 {parsed.problems.length - 4}줄</div>
          )}

          {err && <div className="text-[13px] font-bold mt-2" style={{ color: '#C0392B' }}>⚠️ {err}</div>}

          <div className="flex gap-2 mt-3">
            <button
              onClick={() => { setWriting(false); setErr(''); }}
              className="flex-1 rounded-xl py-2.5 text-[14px] font-bold"
              style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-sub)' }}
            >
              그만두기
            </button>
            <button
              onClick={save}
              disabled={saving || parsed.pairs.length < 2}
              className="flex-1 rounded-xl py-2.5 text-[14px] font-bold text-white disabled:opacity-40"
              style={{ background: 'var(--color-primary)' }}
            >
              {saving ? '만드는 중...' : '만들기'}
            </button>
          </div>
          <p className="text-[12px] mt-2 leading-relaxed" style={{ color: '#A89880' }}>
            낱말 {MAX_PAIRS}개까지 넣을 수 있어요. 한 판에는 6개씩 나와요.
          </p>
        </div>
      )}

      {visible.length === 0 ? (
        <div className="rounded-2xl p-6 text-center" style={{ background: 'rgba(255,255,255,0.8)' }}>
          <div className="text-3xl mb-2">🃏</div>
          <div className="text-[14px] leading-relaxed" style={{ color: '#8A7A5F' }}>
            {isStaff
              ? '아직 스테이지가 없어요. 오늘 배운 낱말을 넣어보세요.'
              : '아직 놀 수 있는 게임이 없어요.'}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {visible.map((s) => (
            <div
              key={s.id}
              className="rounded-2xl p-3 flex items-center gap-3"
              style={{ background: 'rgba(255,255,255,0.85)' }}
            >
              <div
                className="h-10 w-10 shrink-0 rounded-xl flex items-center justify-center text-[15px] font-black"
                style={{ background: '#FFF1D6', color: '#A6762A' }}
              >
                {s.order}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-bold truncate" style={{ color: '#3A3226' }}>
                  {s.title}
                </div>
                <div className="text-[12px]" style={{ color: '#8A7A5F' }}>
                  낱말 {s.pairs?.length ?? 0}개
                  {!s.approved && <span style={{ color: '#C0392B' }}> · 확인 전(아이에게 안 보여요)</span>}
                </div>
              </div>
              <button
                onClick={() => setPlaying(s)}
                className="shrink-0 rounded-xl px-4 py-2 text-[14px] font-bold text-white"
                style={{ background: 'var(--color-primary)' }}
              >
                놀기
              </button>
              {isStaff && (
                <button
                  onClick={() => remove(s.id)}
                  className="shrink-0 text-[12px] underline"
                  style={{ color: '#A89880' }}
                >
                  지우기
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
