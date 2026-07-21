'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { studentsPath, questionsPath, quizSubmissionsPath, inventoryPath } from '@/lib/paths';
import { QuestionType } from '@/lib/firestore-schema';
import { SHOP_ITEMS, ShopItem } from '@/lib/shop-catalog';

/**
 * 교사용 퀴즈 현황판.
 * 숙제 현황판과 같은 원칙 — 기준은 제출물이 아니라 **명부**다. 안 푼 아이가 보여야 한다.
 */

interface RosterRow {
  id: string;
  number: number;
  name: string;
  linkedUid: string | null;
}

interface Answer {
  questionId: string;
  type: QuestionType;
  choiceIndex: number | null;
  text: string;
  correct: boolean | null;
}

type Stamp = { itemId: string; emoji: string; label: string };

interface Sub {
  studentUid: string;
  studentName: string;
  answers: Answer[];
  correctCount: number;
  gradedCount: number;
  /** 문항 id → 선생님이 남긴 반응 */
  feedback: Record<string, { comment?: string; stamp?: Stamp }>;
  checked: boolean;
  stamp: Stamp | null;
}

interface Question {
  id: string;
  order: number;
  type: QuestionType;
  prompt: string;
  choices: string[];
}

export default function QuizTeacherGrid({
  schoolId, classId, quizId,
}: {
  schoolId: string;
  classId: string;
  quizId: string;
}) {
  const { user } = useAuth();
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [subs, setSubs] = useState<Sub[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [openUid, setOpenUid] = useState<string | null>(null);
  const [myStamps, setMyStamps] = useState<ShopItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [draftComment, setDraftComment] = useState<Record<string, string>>({});
  const [pickedStamp, setPickedStamp] = useState('');

  useEffect(() => {
    if (!db || !user) { setMyStamps([]); return; }
    return onSnapshot(
      collection(db, inventoryPath(user.uid)),
      (snap) => {
        const ids = new Set(snap.docs.map((d) => d.id));
        const owned = SHOP_ITEMS.filter((i) => i.category === 'stamp' && ids.has(i.id));
        setMyStamps(owned);
        setPickedStamp((p) => p || owned[0]?.id || '');
      },
      () => setMyStamps([])
    );
  }, [user]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const grade = useCallback(
    async (studentUid: string, patch: Record<string, unknown>) => {
      setBusy(true);
      try {
        const token = await auth?.currentUser?.getIdToken();
        const res = await fetch('/api/quiz', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ action: 'grade', schoolId, classId, quizId, studentUid, ...patch }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          setToast(j.error || '처리하지 못했어요');
          return false;
        }
        return true;
      } finally {
        setBusy(false);
      }
    },
    [schoolId, classId, quizId]
  );

  useEffect(() => {
    if (!db) return;
    return onSnapshot(
      query(collection(db, studentsPath(schoolId, classId)), orderBy('number')),
      (snap) =>
        setRoster(snap.docs.map((d) => {
          const v = d.data();
          return { id: d.id, number: v.number ?? 0, name: v.name || '', linkedUid: v.linkedUid ?? null };
        })),
      () => setRoster([])
    );
  }, [schoolId, classId]);

  useEffect(() => {
    if (!db) return;
    return onSnapshot(
      collection(db, quizSubmissionsPath(schoolId, classId, quizId)),
      (snap) =>
        setSubs(snap.docs.map((d) => {
          const v = d.data();
          return {
            studentUid: v.studentUid || d.id,
            studentName: v.studentName || '',
            answers: v.answers || [],
            correctCount: v.correctCount ?? 0,
            gradedCount: v.gradedCount ?? 0,
            feedback: v.feedback || {},
            checked: v.checked === true,
            stamp: v.stamp ?? null,
          };
        })),
      () => setSubs([])
    );
  }, [schoolId, classId, quizId]);

  useEffect(() => {
    if (!db) return;
    return onSnapshot(
      query(collection(db, questionsPath(schoolId, classId, quizId)), orderBy('order')),
      (snap) =>
        setQuestions(snap.docs.map((d) => {
          const v = d.data();
          return {
            id: d.id, order: v.order ?? 0, type: (v.type as QuestionType) || 'choice',
            prompt: v.prompt || '', choices: v.choices || [],
          };
        })),
      () => setQuestions([])
    );
  }, [schoolId, classId, quizId]);

  const subByUid = useMemo(() => new Map(subs.map((s) => [s.studentUid, s])), [subs]);

  const cells = useMemo(
    () =>
      roster.map((r) => {
        const sub = r.linkedUid ? subByUid.get(r.linkedUid) ?? null : null;
        return { row: r, sub, unlinked: !r.linkedUid };
      }),
    [roster, subByUid]
  );

  const done = cells.filter((c) => c.sub).length;
  const notYet = cells.filter((c) => !c.sub && !c.unlinked).length;
  const unlinked = cells.filter((c) => c.unlinked).length;

  const opened = cells.find((c) => c.row.linkedUid === openUid) ?? null;

  if (roster.length === 0) {
    return (
      <div className="rounded-2xl py-8 px-4 text-center" style={{ background: 'rgba(255,255,255,0.8)' }}>
        <div className="text-3xl mb-2">📋</div>
        <div className="text-[13px] leading-relaxed" style={{ color: '#A89880' }}>
          명부를 등록하면 누가 풀었는지 한눈에 보여요
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex gap-1.5 mb-2.5">
        <div className="flex-1 rounded-xl py-2 text-center" style={{ background: '#F4EEE2', border: '1px solid #E0D3BB' }}>
          <div className="text-base font-black leading-none" style={{ color: '#9C8A6C' }}>{notYet}</div>
          <div className="text-[12px] font-bold mt-0.5" style={{ color: '#9C8A6C' }}>안 풀었어요</div>
        </div>
        <div className="flex-1 rounded-xl py-2 text-center" style={{ background: '#F0E8F6', border: '1px solid #C9AEDC' }}>
          <div className="text-base font-black leading-none" style={{ color: '#7B4B94' }}>{done}</div>
          <div className="text-[12px] font-bold mt-0.5" style={{ color: '#7B4B94' }}>풀었어요</div>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-1.5">
        {cells.map(({ row, sub, unlinked: un }) => (
          <button
            key={row.id}
            disabled={!sub}
            onClick={() => setOpenUid(row.linkedUid)}
            className="rounded-xl py-2 px-1 text-center transition-transform active:scale-95 disabled:cursor-default"
            style={{
              background: un ? '#FFFFFF' : sub ? '#F0E8F6' : '#F4EEE2',
              border: `1px ${un ? 'dashed' : 'solid'} ${un ? '#E0D3BB' : sub ? '#C9AEDC' : '#E0D3BB'}`,
              minHeight: 52,
            }}
          >
            <div className="text-[11px] font-bold leading-none opacity-70" style={{ color: sub ? '#7B4B94' : '#9C8A6C' }}>
              {row.number}
            </div>
            <div className="text-[13px] font-bold leading-tight mt-1 truncate" style={{ color: sub ? '#7B4B94' : un ? '#C0B197' : '#9C8A6C' }}>
              {row.name}
            </div>
          </button>
        ))}
      </div>

      {unlinked > 0 && (
        <div className="text-[12px] mt-2 leading-relaxed" style={{ color: '#A89880' }}>
          점선 칸 {unlinked}명은 아직 학생코드로 계정을 연결하지 않아 풀 수 없어요.
        </div>
      )}

      {toast && (
        <div
          className="fixed left-1/2 -translate-x-1/2 bottom-24 z-[60] rounded-full px-4 py-2 text-[14px] font-bold text-white"
          style={{ background: 'rgba(58,50,38,0.92)' }}
        >
          {toast}
        </div>
      )}

      {/* 한 아이의 답안 */}
      {opened?.sub && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ background: 'rgba(30,26,20,0.45)' }}
          onClick={() => setOpenUid(null)}
        >
          <div
            className="w-full max-w-md rounded-t-3xl p-4 pb-8 max-h-[80vh] overflow-y-auto"
            style={{ background: '#FAF5EA' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-black" style={{ color: '#3A3226' }}>
                {opened.row.number}번 {opened.row.name}
              </div>
              {opened.sub.gradedCount > 0 && (
                <span className="rounded-full px-2.5 py-1 text-[12px] font-bold" style={{ background: '#F0E8F6', color: '#7B4B94' }}>
                  채점 문항 {opened.sub.correctCount}/{opened.sub.gradedCount}
                </span>
              )}
            </div>

            {questions.map((q, i) => {
              const sub = opened.sub!;
              const a = sub.answers.find((x) => x.questionId === q.id);
              const fb = sub.feedback[q.id] || {};
              const key = `${sub.studentUid}:${q.id}`;
              return (
                <div key={q.id} className="rounded-2xl p-3 mb-2" style={{ background: 'white' }}>
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="text-[14px] font-bold" style={{ color: '#3A3226' }}>
                      {i + 1}. {q.prompt}
                    </div>
                    {a?.correct !== null && a?.correct !== undefined && (
                      <span className="shrink-0 text-sm">{a.correct ? '⭕' : '❌'}</span>
                    )}
                  </div>
                  <div className="text-[13px] whitespace-pre-wrap" style={{ color: '#54493A' }}>
                    {q.type === 'choice'
                      ? a?.choiceIndex !== null && a?.choiceIndex !== undefined
                        ? `${a.choiceIndex + 1}. ${q.choices[a.choiceIndex] ?? ''}`
                        : '고르지 않았어요'
                      : a?.text || '적지 않았어요'}
                  </div>

                  {/* 채점이 안 되는 서술형은 선생님 말 한마디가 유일한 반응이다 */}
                  {q.type === 'essay' && (
                    <div className="mt-2 pt-2" style={{ borderTop: '1px dashed #EFE3CB' }}>
                      {fb.stamp && (
                        <div className="text-[13px] font-bold mb-1.5" style={{ color: '#2E8B57' }}>
                          {fb.stamp.emoji} {fb.stamp.label}
                        </div>
                      )}
                      <div className="flex gap-1.5">
                        <input
                          value={draftComment[key] ?? fb.comment ?? ''}
                          onChange={(e) => setDraftComment((p) => ({ ...p, [key]: e.target.value }))}
                          placeholder="한마디 남겨주세요"
                          className="min-w-0 flex-1 rounded-lg px-2.5 py-1.5 text-[13px] outline-none"
                          style={{ background: '#F6F0E4', color: '#3A3226' }}
                        />
                        <button
                          onClick={async () => {
                            const text = draftComment[key] ?? fb.comment ?? '';
                            if (await grade(sub.studentUid, { questionId: q.id, comment: text })) {
                              setToast('한마디 남겼어요');
                            }
                          }}
                          disabled={busy}
                          className="shrink-0 rounded-lg px-2.5 py-1.5 text-[13px] font-bold text-white disabled:opacity-40"
                          style={{ background: 'var(--color-primary)' }}
                        >
                          저장
                        </button>
                        {myStamps.length > 0 && (
                          <button
                            onClick={async () => {
                              if (await grade(sub.studentUid, { questionId: q.id, stampId: pickedStamp })) {
                                setToast('도장 찍었어요');
                              }
                            }}
                            disabled={busy}
                            className="shrink-0 rounded-lg px-2.5 py-1.5 text-[13px] font-bold disabled:opacity-40"
                            style={{ background: '#F0E8F6', color: '#7B4B94' }}
                          >
                            도장
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {q.type !== 'essay' && fb.comment && (
                    <div className="mt-1.5 rounded-lg px-2 py-1 text-[12px]" style={{ background: '#FFF3E0', color: '#8A6D2F' }}>
                      👩‍🏫 {fb.comment}
                    </div>
                  )}
                </div>
              );
            })}

            {/* 전체 검사완료 — 숙제와 같은 방식으로 도장 1개 */}
            {myStamps.length > 0 && !opened.sub.checked && (
              <>
                <div className="text-[13px] font-bold mb-1.5" style={{ color: '#8A7A5F' }}>💮 찍어줄 도장</div>
                <div className="flex flex-wrap gap-1.5 mb-2.5">
                  {myStamps.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setPickedStamp(s.id)}
                      className="flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-[13px] font-bold"
                      style={
                        pickedStamp === s.id
                          ? { background: 'var(--color-primary)', color: 'white' }
                          : { background: 'white', color: '#8A7A5F' }
                      }
                    >
                      <span className="text-sm">{s.emoji}</span>
                      {s.label}
                    </button>
                  ))}
                </div>
              </>
            )}

            {opened.sub.checked && opened.sub.stamp && (
              <div className="rounded-xl px-3 py-2 mb-2 text-[14px] font-bold text-center" style={{ background: '#E2F6E9', color: '#2E8B57' }}>
                {opened.sub.stamp.emoji} {opened.sub.stamp.label}
              </div>
            )}

            <button
              onClick={async () => {
                const next = !opened.sub!.checked;
                if (await grade(opened.sub!.studentUid, { check: next, stampId: next ? pickedStamp : undefined })) {
                  setToast(next ? `검사완료! ${opened.row.name}에게 도장 1개 🏅` : '검사완료를 취소했어요');
                }
              }}
              disabled={busy}
              className="w-full rounded-xl py-3 text-[15px] font-bold disabled:opacity-40"
              style={
                opened.sub.checked
                  ? { background: '#E2F6E9', color: '#2E8B57', border: '1px solid #A0DCB7' }
                  : { background: 'var(--color-primary)', color: 'white' }
              }
            >
              {opened.sub.checked ? '✅ 검사완료 (눌러서 취소)' : '도장 찍고 검사완료'}
            </button>

            <button
              onClick={() => setOpenUid(null)}
              className="w-full rounded-xl py-2.5 mt-2 text-[14px] font-bold"
              style={{ background: 'rgba(255,255,255,0.8)', color: '#8A7A5F' }}
            >
              닫기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
