'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { studentsPath, questionsPath, quizSubmissionsPath } from '@/lib/paths';
import { QuestionType } from '@/lib/firestore-schema';

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

interface Sub {
  studentUid: string;
  studentName: string;
  answers: Answer[];
  correctCount: number;
  gradedCount: number;
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
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [subs, setSubs] = useState<Sub[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [openUid, setOpenUid] = useState<string | null>(null);

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
        <div className="text-[11px] leading-relaxed" style={{ color: '#A89880' }}>
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
          <div className="text-[10px] font-bold mt-0.5" style={{ color: '#9C8A6C' }}>안 풀었어요</div>
        </div>
        <div className="flex-1 rounded-xl py-2 text-center" style={{ background: '#F0E8F6', border: '1px solid #C9AEDC' }}>
          <div className="text-base font-black leading-none" style={{ color: '#7B4B94' }}>{done}</div>
          <div className="text-[10px] font-bold mt-0.5" style={{ color: '#7B4B94' }}>풀었어요</div>
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
            <div className="text-[9px] font-bold leading-none opacity-70" style={{ color: sub ? '#7B4B94' : '#9C8A6C' }}>
              {row.number}
            </div>
            <div className="text-[11px] font-bold leading-tight mt-1 truncate" style={{ color: sub ? '#7B4B94' : un ? '#C0B197' : '#9C8A6C' }}>
              {row.name}
            </div>
          </button>
        ))}
      </div>

      {unlinked > 0 && (
        <div className="text-[10px] mt-2 leading-relaxed" style={{ color: '#A89880' }}>
          점선 칸 {unlinked}명은 아직 학생코드로 계정을 연결하지 않아 풀 수 없어요.
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
                <span className="rounded-full px-2.5 py-1 text-[10px] font-bold" style={{ background: '#F0E8F6', color: '#7B4B94' }}>
                  채점 문항 {opened.sub.correctCount}/{opened.sub.gradedCount}
                </span>
              )}
            </div>

            {questions.map((q, i) => {
              const a = opened.sub!.answers.find((x) => x.questionId === q.id);
              return (
                <div key={q.id} className="rounded-2xl p-3 mb-2" style={{ background: 'white' }}>
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="text-[12px] font-bold" style={{ color: '#3A3226' }}>
                      {i + 1}. {q.prompt}
                    </div>
                    {a?.correct !== null && a?.correct !== undefined && (
                      <span className="shrink-0 text-sm">{a.correct ? '⭕' : '❌'}</span>
                    )}
                  </div>
                  <div className="text-[11px] whitespace-pre-wrap" style={{ color: '#54493A' }}>
                    {q.type === 'choice'
                      ? a?.choiceIndex !== null && a?.choiceIndex !== undefined
                        ? `${a.choiceIndex + 1}. ${q.choices[a.choiceIndex] ?? ''}`
                        : '고르지 않았어요'
                      : a?.text || '적지 않았어요'}
                  </div>
                  {q.type === 'essay' && (
                    <div className="text-[9px] mt-1" style={{ color: '#A89880' }}>
                      서술형 — 채점하지 않아요
                    </div>
                  )}
                </div>
              );
            })}

            <button
              onClick={() => setOpenUid(null)}
              className="w-full rounded-xl py-2.5 mt-2 text-[12px] font-bold"
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
