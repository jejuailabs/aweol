'use client';

import { useEffect, useState, useCallback } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { canManageClass } from '@/lib/auth-helpers';
import { quizzesPath } from '@/lib/paths';
import { HomeworkVisibility } from '@/lib/firestore-schema';
import QuizCompose from './QuizCompose';
import QuizSolve from './QuizSolve';
import QuizTeacherGrid from './QuizTeacherGrid';

interface Quiz {
  id: string;
  title: string;
  description: string;
  visibility: HomeworkVisibility;
  questionCount: number;
  authorName: string;
}

export default function QuizPanel({ schoolId, classId }: { schoolId: string; classId: string }) {
  const { user, role } = useAuth();
  const isStaff = canManageClass(role);

  const [list, setList] = useState<Quiz[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [writing, setWriting] = useState(false);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    if (!db) return;
    return onSnapshot(
      query(collection(db, quizzesPath(schoolId, classId)), orderBy('createdAt', 'desc')),
      (snap) =>
        setList(
          snap.docs.map((d) => {
            const v = d.data();
            return {
              id: d.id,
              title: v.title || '',
              description: v.description || '',
              visibility: v.visibility || 'class',
              questionCount: v.questionCount ?? 0,
              authorName: v.authorName || '선생님',
            };
          })
        ),
      () => setList([])
    );
  }, [schoolId, classId]);

  const open = list.find((q) => q.id === openId) || null;

  const remove = useCallback(async (quizId: string) => {
    setRemoving(true);
    try {
      const token = await auth?.currentUser?.getIdToken();
      await fetch(
        `/api/quiz?schoolId=${schoolId}&classId=${classId}&quizId=${quizId}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
      );
      setOpenId(null);
    } finally {
      setRemoving(false);
    }
  }, [schoolId, classId]);

  if (writing) {
    return (
      <QuizCompose
        schoolId={schoolId}
        classId={classId}
        onDone={() => setWriting(false)}
        onCancel={() => setWriting(false)}
      />
    );
  }

  if (open) {
    return (
      <div>
        <button onClick={() => setOpenId(null)} className="text-[11px] font-bold mb-2.5" style={{ color: '#8A7A5F' }}>
          ← 퀴즈 목록
        </button>

        {isStaff ? (
          <>
            <div className="rounded-2xl p-4 mb-3" style={{ background: 'rgba(255,255,255,0.8)' }}>
              <div className="flex items-start justify-between gap-2">
                <div className="text-base font-black" style={{ color: '#3A3226' }}>{open.title}</div>
                <button
                  onClick={() => remove(open.id)}
                  disabled={removing}
                  className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold disabled:opacity-40"
                  style={{ background: 'rgba(232,96,76,0.15)', color: '#E8604C' }}
                >
                  삭제
                </button>
              </div>
              <div className="text-[11px] mt-1" style={{ color: '#8A7A5F' }}>
                문제 {open.questionCount}개 · {open.visibility === 'class' ? '함께 보기' : '선생님만'}
              </div>
            </div>
            <QuizTeacherGrid schoolId={schoolId} classId={classId} quizId={open.id} />
          </>
        ) : user ? (
          <QuizSolve
            schoolId={schoolId}
            classId={classId}
            quizId={open.id}
            title={open.title}
            description={open.description}
          />
        ) : (
          <div className="py-10 text-center text-[11px]" style={{ color: '#A89880' }}>
            로그인하면 퀴즈를 풀 수 있어요
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      {isStaff && (
        <button
          onClick={() => setWriting(true)}
          className="w-full rounded-2xl py-3 mb-3 text-xs font-bold border-2 border-dashed"
          style={{ borderColor: '#7B4B9480', color: '#7B4B94' }}
        >
          + 새 퀴즈 내기
        </button>
      )}

      {list.length === 0 ? (
        <div className="py-10 text-center">
          <div className="text-4xl mb-2">🧩</div>
          <div className="text-xs" style={{ color: '#A89880' }}>아직 나온 퀴즈가 없어요</div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {list.map((q) => (
            <button
              key={q.id}
              onClick={() => setOpenId(q.id)}
              className="rounded-2xl p-3.5 text-left transition-transform hover:scale-[1.01]"
              style={{ background: 'rgba(255,255,255,0.8)' }}
            >
              <div className="text-sm font-bold" style={{ color: '#3A3226' }}>{q.title}</div>
              <div className="flex gap-1.5 mt-1">
                <span className="rounded-full px-2 py-0.5 text-[9px] font-bold" style={{ background: '#7B4B9420', color: '#7B4B94' }}>
                  문제 {q.questionCount}개
                </span>
                <span className="rounded-full px-2 py-0.5 text-[9px] font-bold" style={{ background: '#8A7A5F20', color: '#8A7A5F' }}>
                  {q.visibility === 'class' ? '함께 보기' : '선생님만'}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
