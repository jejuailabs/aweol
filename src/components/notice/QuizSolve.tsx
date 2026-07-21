'use client';

import { useEffect, useState, useCallback } from 'react';
import { collection, doc, onSnapshot, orderBy, query } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { questionsPath, quizSubmissionsPath } from '@/lib/paths';
import { QuestionType } from '@/lib/firestore-schema';
import { youtubeEmbedUrl } from '@/lib/quiz-utils';

interface Question {
  id: string;
  order: number;
  type: QuestionType;
  prompt: string;
  media: 'none' | 'image' | 'youtube';
  imageUrl: string;
  youtubeId: string;
  choices: string[];
}

type Stamp = { itemId: string; emoji: string; label: string };

interface MyAnswer {
  questionId: string;
  type: QuestionType;
  choiceIndex: number | null;
  text: string;
  correct: boolean | null;
}

/**
 * 학생용 퀴즈 풀이.
 * 정답은 서버에만 있어서, 낼 때까지는 화면 어디에도 답이 없다.
 * 제출하고 나서야 문항별 정오와 해설 버튼이 열린다.
 */
export default function QuizSolve({
  schoolId, classId, quizId, title, description,
}: {
  schoolId: string;
  classId: string;
  quizId: string;
  title: string;
  description: string;
}) {
  const { user } = useAuth();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [choice, setChoice] = useState<Record<string, number>>({});
  const [text, setText] = useState<Record<string, string>>({});
  const [mine, setMine] = useState<MyAnswer[] | null>(null);
  const [feedback, setFeedback] = useState<Record<string, { comment?: string; stamp?: Stamp }>>({});
  const [overallStamp, setOverallStamp] = useState<Stamp | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // 해설
  const [explain, setExplain] = useState<Record<string, string>>({});
  const [loadingId, setLoadingId] = useState('');

  useEffect(() => {
    if (!db) return;
    return onSnapshot(
      query(collection(db, questionsPath(schoolId, classId, quizId)), orderBy('order')),
      (snap) =>
        setQuestions(
          snap.docs.map((d) => {
            const v = d.data();
            return {
              id: d.id,
              order: v.order ?? 0,
              type: (v.type as QuestionType) || 'choice',
              prompt: v.prompt || '',
              media: v.media || 'none',
              imageUrl: v.imageUrl || '',
              youtubeId: v.youtubeId || '',
              choices: v.choices || [],
            };
          })
        ),
      () => setQuestions([])
    );
  }, [schoolId, classId, quizId]);

  // 이미 낸 적이 있으면 결과 화면으로.
  // 구독으로 두는 이유: 선생님이 나중에 남긴 한마디와 도장이 새로고침 없이 보여야 한다.
  useEffect(() => {
    if (!db || !user) { setMine(null); return; }
    return onSnapshot(
      doc(db, quizSubmissionsPath(schoolId, classId, quizId), user.uid),
      (s) => {
        if (!s.exists()) { setMine(null); return; }
        const v = s.data();
        setMine((v.answers as MyAnswer[]) || []);
        setFeedback(v.feedback || {});
        setOverallStamp(v.stamp ?? null);
      },
      () => setMine(null)
    );
  }, [schoolId, classId, quizId, user]);

  const submit = useCallback(async () => {
    setSubmitting(true);
    setError('');
    try {
      const token = await auth?.currentUser?.getIdToken();
      const res = await fetch('/api/quiz', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          schoolId,
          classId,
          quizId,
          answers: questions.map((q) => ({
            questionId: q.id,
            choiceIndex: q.type === 'choice' ? choice[q.id] ?? null : null,
            text: q.type === 'choice' ? '' : text[q.id] || '',
          })),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setError(json.error || '내지 못했어요'); return; }
      // 서버가 돌려준 정오로 결과 화면을 만든다
      const byId = new Map<string, boolean | null>(
        (json.results || []).map((r: { questionId: string; correct: boolean | null }) => [r.questionId, r.correct])
      );
      setMine(
        questions.map((q) => ({
          questionId: q.id,
          type: q.type,
          choiceIndex: q.type === 'choice' ? choice[q.id] ?? null : null,
          text: q.type === 'choice' ? '' : text[q.id] || '',
          correct: byId.get(q.id) ?? null,
        }))
      );
    } finally {
      setSubmitting(false);
    }
  }, [schoolId, classId, quizId, questions, choice, text]);

  const askExplain = useCallback(async (questionId: string) => {
    setLoadingId(questionId);
    try {
      const token = await auth?.currentUser?.getIdToken();
      const res = await fetch('/api/quiz-explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ schoolId, classId, quizId, questionId }),
      });
      const json = await res.json().catch(() => ({}));
      setExplain((p) => ({
        ...p,
        [questionId]: res.ok ? json.explanation : json.error || '설명을 가져오지 못했어요',
      }));
    } finally {
      setLoadingId('');
    }
  }, [schoolId, classId, quizId]);

  const answered = questions.filter((q) =>
    q.type === 'choice' ? choice[q.id] !== undefined : (text[q.id] || '').trim()
  ).length;

  if (questions.length === 0) {
    return (
      <div className="py-10 text-center text-[13px]" style={{ color: '#A89880' }}>
        문제를 불러오는 중이에요...
      </div>
    );
  }

  // ---------- 결과 ----------
  if (mine) {
    const byId = new Map(mine.map((m) => [m.questionId, m]));
    return (
      <div>
        <div className="rounded-2xl p-4 mb-3 text-center" style={{ background: '#F0E8F6' }}>
          <div className="text-3xl mb-1">🎉</div>
          <div className="text-sm font-black" style={{ color: '#5A3570' }}>다 풀었어요!</div>
          <div className="text-[13px] mt-1" style={{ color: '#7B4B94' }}>
            궁금한 문제는 <b>설명 듣기</b>를 눌러보세요
          </div>
        </div>

        {overallStamp && (
          <div
            className="rounded-2xl px-3 py-3 mb-3 text-center"
            style={{ background: '#E2F6E9', border: '1px solid #A0DCB7' }}
          >
            <div className="text-2xl leading-none mb-1">{overallStamp.emoji}</div>
            <div className="text-[14px] font-bold" style={{ color: '#2E8B57' }}>{overallStamp.label}</div>
            <div className="text-[12px] mt-0.5" style={{ color: '#5FA87C' }}>
              선생님이 도장을 찍어주셨어요 🏅
            </div>
          </div>
        )}

        {questions.map((q, i) => {
          const a = byId.get(q.id);
          const isEssay = q.type === 'essay';
          return (
            <div key={q.id} className="rounded-2xl p-3.5 mb-2" style={{ background: 'white' }}>
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <div className="text-[14px] font-bold" style={{ color: '#3A3226' }}>
                  {i + 1}. {q.prompt}
                </div>
                {!isEssay && (
                  <span className="shrink-0 text-base">{a?.correct ? '⭕' : '❌'}</span>
                )}
              </div>

              {q.type === 'choice' && (
                <div className="text-[13px] mb-1" style={{ color: '#8A7A5F' }}>
                  내가 고른 답: {a?.choiceIndex !== null && a?.choiceIndex !== undefined
                    ? `${a.choiceIndex + 1}. ${q.choices[a.choiceIndex] ?? ''}`
                    : '고르지 않았어요'}
                </div>
              )}
              {q.type !== 'choice' && (
                <div className="text-[13px] mb-1 whitespace-pre-wrap" style={{ color: '#8A7A5F' }}>
                  내 답: {a?.text || '적지 않았어요'}
                </div>
              )}
              {isEssay && !feedback[q.id]?.comment && !feedback[q.id]?.stamp && (
                <div className="text-[12px] mb-1" style={{ color: '#A89880' }}>
                  선생님이 읽고 답해주실 거예요
                </div>
              )}

              {feedback[q.id]?.stamp && (
                <div className="mt-1.5 text-[14px] font-bold" style={{ color: '#2E8B57' }}>
                  {feedback[q.id].stamp!.emoji} {feedback[q.id].stamp!.label}
                </div>
              )}
              {feedback[q.id]?.comment && (
                <div className="mt-1.5 rounded-xl px-3 py-2 text-[14px]" style={{ background: '#FFF3E0', color: '#8A6D2F' }}>
                  👩‍🏫 {feedback[q.id].comment}
                </div>
              )}

              {explain[q.id] ? (
                <div className="mt-2 rounded-xl px-3 py-2.5 text-[14px] leading-relaxed whitespace-pre-wrap"
                     style={{ background: '#F0E8F6', color: '#4A2C5A' }}>
                  💡 {explain[q.id]}
                </div>
              ) : (
                <button
                  onClick={() => askExplain(q.id)}
                  disabled={loadingId === q.id}
                  className="mt-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-bold disabled:opacity-50"
                  style={{ background: '#F0E8F6', color: '#7B4B94' }}
                >
                  {loadingId === q.id ? '생각하는 중...' : '💡 왜 그런지 설명 듣기'}
                </button>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // ---------- 풀이 ----------
  return (
    <div>
      <div className="rounded-2xl p-4 mb-3" style={{ background: 'rgba(255,255,255,0.8)' }}>
        <div className="text-base font-black" style={{ color: '#3A3226' }}>{title}</div>
        {description && (
          <div className="text-[14px] mt-1 leading-relaxed whitespace-pre-wrap" style={{ color: '#54493A' }}>
            {description}
          </div>
        )}
        <div className="text-[13px] mt-2 font-bold" style={{ color: '#7B4B94' }}>
          {answered} / {questions.length} 문제 풀었어요
        </div>
      </div>

      {questions.map((q, i) => (
        <div key={q.id} className="rounded-2xl p-3.5 mb-2.5" style={{ background: 'white' }}>
          <div className="text-[15px] font-bold mb-2" style={{ color: '#3A3226' }}>
            {i + 1}. {q.prompt}
          </div>

          {q.media === 'image' && q.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={q.imageUrl} alt="" className="w-full rounded-xl mb-2" style={{ maxHeight: 260, objectFit: 'contain' }} />
          )}
          {q.media === 'youtube' && q.youtubeId && (
            <div className="relative w-full mb-2 rounded-xl overflow-hidden" style={{ paddingTop: '56.25%' }}>
              <iframe
                src={youtubeEmbedUrl(q.youtubeId)}
                title={`${i + 1}번 문제 영상`}
                className="absolute inset-0 w-full h-full"
                allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          )}

          {q.type === 'choice' && (
            <div className="flex flex-col gap-1.5">
              {q.choices.map((c, ci) => (
                <button
                  key={ci}
                  onClick={() => setChoice((p) => ({ ...p, [q.id]: ci }))}
                  className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-left text-[14px] font-bold"
                  style={{
                    background: choice[q.id] === ci ? '#7B4B94' : '#F6F0E4',
                    color: choice[q.id] === ci ? 'white' : '#54493A',
                  }}
                >
                  <span
                    className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[12px]"
                    style={{
                      background: choice[q.id] === ci ? 'rgba(255,255,255,0.25)' : 'white',
                      color: choice[q.id] === ci ? 'white' : '#A89880',
                    }}
                  >
                    {ci + 1}
                  </span>
                  {c}
                </button>
              ))}
            </div>
          )}

          {q.type === 'short' && (
            <input
              value={text[q.id] || ''}
              onChange={(e) => setText((p) => ({ ...p, [q.id]: e.target.value }))}
              placeholder="답을 적어보세요"
              className="w-full rounded-xl px-3 py-2.5 text-[15px] outline-none"
              style={{ background: '#F6F0E4', color: '#3A3226' }}
            />
          )}

          {q.type === 'essay' && (
            <textarea
              value={text[q.id] || ''}
              onChange={(e) => setText((p) => ({ ...p, [q.id]: e.target.value }))}
              rows={5}
              placeholder="생각을 자유롭게 적어보세요"
              className="w-full rounded-xl px-3 py-2.5 text-[15px] outline-none resize-none"
              style={{ background: '#F6F0E4', color: '#3A3226' }}
            />
          )}
        </div>
      ))}

      {error && (
        <div className="text-[13px] font-bold mb-2" style={{ color: '#C0392B' }}>{error}</div>
      )}

      <button
        onClick={submit}
        disabled={submitting || answered === 0}
        className="w-full rounded-xl py-3 text-sm font-bold text-white disabled:opacity-40"
        style={{ background: '#7B4B94' }}
      >
        {submitting ? '내는 중...' : '다 풀었어요!'}
      </button>
      {answered < questions.length && answered > 0 && (
        <div className="text-[12px] mt-1.5 text-center" style={{ color: '#A89880' }}>
          아직 안 푼 문제가 {questions.length - answered}개 있어요
        </div>
      )}
      <div className="text-[12px] mt-1.5 text-center" style={{ color: '#A89880' }}>
        한 번 내면 다시 풀 수 없어요
      </div>
    </div>
  );
}
