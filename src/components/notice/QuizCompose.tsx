'use client';

import { useState, useCallback, useRef } from 'react';
import { ref as sRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, storage } from '@/lib/firebase';
import { QuestionType } from '@/lib/firestore-schema';
import {
  parseYoutubeId, youtubeThumbUrl, MAX_QUESTIONS, MAX_CHOICES,
} from '@/lib/quiz-utils';

/** 편집 중인 문항 (저장 전이라 서버 스키마와 모양이 조금 다르다) */
interface Draft {
  key: number;
  type: QuestionType;
  prompt: string;
  media: 'none' | 'image' | 'youtube';
  imageUrl: string;
  uploading: boolean;
  youtube: string;
  choices: string[];
  answerIndex: number;
  acceptable: string;
  explanation: string;
}

const TYPE_LABEL: Record<QuestionType, string> = {
  choice: '⭕ 객관식',
  short: '✏️ 단답형',
  essay: '📝 서술형',
};

let seq = 0;
const newDraft = (): Draft => ({
  key: ++seq,
  type: 'choice',
  prompt: '',
  media: 'none',
  imageUrl: '',
  uploading: false,
  youtube: '',
  choices: ['', ''],
  answerIndex: 0,
  acceptable: '',
  explanation: '',
});

/** 수정 모드로 열 때 넘겨주는 기존 퀴즈 */
export interface QuizEditSeed {
  quizId: string;
  title: string;
  description: string;
  visibility: 'class' | 'teacher';
  questions: {
    type: QuestionType;
    prompt: string;
    media: 'none' | 'image' | 'youtube';
    imageUrl: string;
    youtubeId: string;
    choices: string[];
    explanation: string;
    /** 정답지에서 읽어온 값 (교직원만 읽을 수 있다) */
    answerIndex: number | null;
    acceptable: string[];
  }[];
}

export default function QuizCompose({
  schoolId, classId, edit, onDone, onCancel,
}: {
  schoolId: string;
  classId: string;
  /** 있으면 수정 모드 */
  edit?: QuizEditSeed | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(edit?.title || '');
  const [desc, setDesc] = useState(edit?.description || '');
  const [vis, setVis] = useState<'class' | 'teacher'>(edit?.visibility || 'class');
  const [drafts, setDrafts] = useState<Draft[]>(() =>
    edit
      ? edit.questions.map((q) => ({
          ...newDraft(),
          type: q.type,
          prompt: q.prompt,
          media: q.media,
          imageUrl: q.imageUrl,
          youtube: q.youtubeId,
          choices: q.choices.length >= 2 ? q.choices : ['', ''],
          answerIndex: q.answerIndex ?? 0,
          acceptable: q.acceptable.join(', '),
          explanation: q.explanation,
        }))
      : [newDraft()]
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // 이미 푼 아이가 있으면 서버가 되물어본다. 확인을 받으면 force 로 다시 보낸다.
  const [confirmMsg, setConfirmMsg] = useState('');
  const fileRefs = useRef<Record<number, HTMLInputElement | null>>({});

  const patch = useCallback((key: number, p: Partial<Draft>) => {
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...p } : d)));
  }, []);

  const upload = useCallback(async (key: number, file: File) => {
    if (!storage || !auth?.currentUser) return;
    patch(key, { uploading: true });
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `quiz/${auth.currentUser.uid}/${Date.now()}-${key}.${ext}`;
      const r = sRef(storage, path);
      await uploadBytes(r, file);
      patch(key, { imageUrl: await getDownloadURL(r), media: 'image', uploading: false });
    } catch {
      patch(key, { uploading: false });
      setError('사진을 올리지 못했어요');
    }
  }, [patch]);

  const save = useCallback(async (force = false) => {
    setSaving(true);
    setError('');
    try {
      const token = await auth?.currentUser?.getIdToken();
      const res = await fetch('/api/quiz', {
        method: edit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          ...(edit ? { action: 'edit', quizId: edit.quizId, force } : {}),
          schoolId,
          classId,
          title,
          description: desc,
          visibility: vis,
          questions: drafts.map((d) => ({
            type: d.type,
            prompt: d.prompt,
            media: d.media,
            imageUrl: d.imageUrl,
            youtube: d.youtube,
            choices: d.type === 'choice' ? d.choices : [],
            answerIndex: d.answerIndex,
            // 쉼표로 여러 표기를 받는다 ("3개, 세개, 3")
            acceptable: d.type === 'short'
              ? d.acceptable.split(',').map((s) => s.trim()).filter(Boolean)
              : [],
            explanation: d.explanation,
          })),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        // 이미 푼 아이가 있으면 서버가 되물어본다
        if (json.needsConfirm) setConfirmMsg(json.error || '');
        else setError(json.error || '내지 못했어요');
        return;
      }
      onDone();
    } finally {
      setSaving(false);
    }
  }, [schoolId, classId, title, desc, vis, drafts, edit, onDone]);

  return (
    <div>
      <button onClick={onCancel} className="text-[11px] font-bold mb-2.5" style={{ color: '#8A7A5F' }}>
        ← 퀴즈 목록
      </button>

      <div className="text-sm font-black mb-3" style={{ color: '#3A3226' }}>
        {edit ? '🧩 퀴즈 고치기' : '🧩 퀴즈 내기'}
      </div>

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="퀴즈 제목 (예: 3단원 복습 퀴즈)"
        className="w-full rounded-xl px-3 py-2.5 text-sm outline-none mb-2"
        style={{ background: 'rgba(255,255,255,0.9)', color: '#3A3226' }}
      />
      <textarea
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
        rows={2}
        placeholder="설명 (선택)"
        className="w-full rounded-xl px-3 py-2.5 text-sm outline-none resize-none mb-3"
        style={{ background: 'rgba(255,255,255,0.9)', color: '#3A3226' }}
      />

      <div className="text-[11px] font-bold mb-1.5" style={{ color: '#8A7A5F' }}>누가 볼 수 있나요?</div>
      <div className="flex gap-1.5 mb-4">
        {([
          { v: 'class' as const, label: '👀 아이들과 함께 보기' },
          { v: 'teacher' as const, label: '🔒 선생님만 보기' },
        ]).map((o) => (
          <button
            key={o.v}
            onClick={() => setVis(o.v)}
            className="flex-1 rounded-xl py-2.5 text-[11px] font-bold"
            style={{
              background: vis === o.v ? '#7B4B94' : 'rgba(255,255,255,0.85)',
              color: vis === o.v ? 'white' : '#8A7A5F',
            }}
          >
            {o.label}
          </button>
        ))}
      </div>

      {drafts.map((d, i) => (
        <div key={d.key} className="rounded-2xl p-3.5 mb-2.5" style={{ background: 'rgba(255,255,255,0.85)' }}>
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-black" style={{ color: '#3A3226' }}>{i + 1}번 문제</div>
            {drafts.length > 1 && (
              <button
                onClick={() => setDrafts((p) => p.filter((x) => x.key !== d.key))}
                className="rounded-full px-2.5 py-1 text-[10px] font-bold"
                style={{ background: 'rgba(232,96,76,0.15)', color: '#E8604C' }}
              >
                빼기
              </button>
            )}
          </div>

          {/* 유형 */}
          <div className="flex gap-1.5 mb-2">
            {(Object.keys(TYPE_LABEL) as QuestionType[]).map((t) => (
              <button
                key={t}
                onClick={() => patch(d.key, { type: t })}
                className="flex-1 rounded-xl py-2 text-[10px] font-bold"
                style={{
                  background: d.type === t ? '#7B4B94' : 'white',
                  color: d.type === t ? 'white' : '#8A7A5F',
                }}
              >
                {TYPE_LABEL[t]}
              </button>
            ))}
          </div>

          <textarea
            value={d.prompt}
            onChange={(e) => patch(d.key, { prompt: e.target.value })}
            rows={2}
            placeholder="문제를 적어주세요"
            className="w-full rounded-xl px-3 py-2 text-[13px] outline-none resize-none mb-2"
            style={{ background: 'white', color: '#3A3226' }}
          />

          {/* 자료 붙이기 */}
          <div className="flex gap-1.5 mb-2">
            {([
              { v: 'none' as const, label: '자료 없음' },
              { v: 'image' as const, label: '📷 사진' },
              { v: 'youtube' as const, label: '▶️ 유튜브' },
            ]).map((o) => (
              <button
                key={o.v}
                onClick={() => patch(d.key, { media: o.v })}
                className="flex-1 rounded-lg py-1.5 text-[10px] font-bold"
                style={{
                  background: d.media === o.v ? '#E8DCF0' : 'white',
                  color: d.media === o.v ? '#7B4B94' : '#A89880',
                }}
              >
                {o.label}
              </button>
            ))}
          </div>

          {d.media === 'image' && (
            <div className="mb-2">
              <button
                onClick={() => fileRefs.current[d.key]?.click()}
                className="w-full rounded-xl py-6 flex flex-col items-center gap-1 border-2 border-dashed overflow-hidden"
                style={{ borderColor: '#D8C9AC', background: 'white' }}
              >
                {d.uploading ? (
                  <span className="text-[11px]" style={{ color: '#A89880' }}>올리는 중...</span>
                ) : d.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={d.imageUrl} alt="" style={{ maxHeight: 160 }} className="object-contain" />
                ) : (
                  <>
                    <span className="text-2xl">📷</span>
                    <span className="text-[11px]" style={{ color: '#A89880' }}>사진 고르기</span>
                  </>
                )}
              </button>
              <input
                ref={(el) => { fileRefs.current[d.key] = el; }}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) upload(d.key, f);
                }}
              />
            </div>
          )}

          {d.media === 'youtube' && (
            <div className="mb-2">
              <input
                value={d.youtube}
                onChange={(e) => patch(d.key, { youtube: e.target.value })}
                placeholder="유튜브 주소를 붙여넣으세요"
                className="w-full rounded-xl px-3 py-2 text-[12px] outline-none"
                style={{ background: 'white', color: '#3A3226' }}
              />
              {d.youtube && (
                parseYoutubeId(d.youtube) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={youtubeThumbUrl(parseYoutubeId(d.youtube))}
                    alt=""
                    className="w-full rounded-lg mt-1.5"
                    style={{ maxHeight: 140, objectFit: 'cover' }}
                  />
                ) : (
                  <div className="text-[10px] mt-1" style={{ color: '#C0392B' }}>
                    주소를 알아볼 수 없어요
                  </div>
                )
              )}
            </div>
          )}

          {/* 유형별 정답 입력 */}
          {d.type === 'choice' && (
            <>
              <div className="text-[10px] font-bold mb-1" style={{ color: '#8A7A5F' }}>
                보기 (동그라미가 정답)
              </div>
              {d.choices.map((c, ci) => (
                <div key={ci} className="flex items-center gap-1.5 mb-1.5">
                  <button
                    onClick={() => patch(d.key, { answerIndex: ci })}
                    className="shrink-0 w-6 h-6 rounded-full text-[11px] font-bold"
                    style={{
                      background: d.answerIndex === ci ? '#3BAF9F' : 'white',
                      color: d.answerIndex === ci ? 'white' : '#A89880',
                      border: `1px solid ${d.answerIndex === ci ? '#3BAF9F' : '#E0D3BB'}`,
                    }}
                  >
                    {ci + 1}
                  </button>
                  <input
                    value={c}
                    onChange={(e) => patch(d.key, {
                      choices: d.choices.map((x, xi) => (xi === ci ? e.target.value : x)),
                    })}
                    placeholder={`${ci + 1}번 보기`}
                    className="min-w-0 flex-1 rounded-lg px-2.5 py-1.5 text-[12px] outline-none"
                    style={{ background: 'white', color: '#3A3226' }}
                  />
                  {d.choices.length > 2 && (
                    <button
                      onClick={() => patch(d.key, {
                        choices: d.choices.filter((_, xi) => xi !== ci),
                        answerIndex: d.answerIndex >= ci && d.answerIndex > 0 ? d.answerIndex - 1 : d.answerIndex,
                      })}
                      className="shrink-0 text-[14px]"
                      style={{ color: '#C9BBA2' }}
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
              {d.choices.length < MAX_CHOICES && (
                <button
                  onClick={() => patch(d.key, { choices: [...d.choices, ''] })}
                  className="text-[10px] font-bold mb-1"
                  style={{ color: '#7B4B94' }}
                >
                  + 보기 추가
                </button>
              )}
            </>
          )}

          {d.type === 'short' && (
            <>
              <div className="text-[10px] font-bold mb-1" style={{ color: '#8A7A5F' }}>
                정답 (여러 표기는 쉼표로: 3개, 세개, 3)
              </div>
              <input
                value={d.acceptable}
                onChange={(e) => patch(d.key, { acceptable: e.target.value })}
                placeholder="정답을 적어주세요"
                className="w-full rounded-lg px-2.5 py-1.5 text-[12px] outline-none mb-1"
                style={{ background: 'white', color: '#3A3226' }}
              />
              <div className="text-[9px] mb-1" style={{ color: '#A89880' }}>
                띄어쓰기와 마침표는 무시하고 채점해요
              </div>
            </>
          )}

          {d.type === 'essay' && (
            <div className="rounded-lg px-2.5 py-2 mb-1 text-[10px] leading-relaxed" style={{ background: '#F6F0E4', color: '#8A7A5F' }}>
              서술형은 채점하지 않아요. 아이들 답을 선생님이 읽고 도장·코멘트로 반응해 주세요.
            </div>
          )}

          <input
            value={d.explanation}
            onChange={(e) => patch(d.key, { explanation: e.target.value })}
            placeholder="해설 (비워두면 AI가 만들어요)"
            className="w-full rounded-lg px-2.5 py-1.5 text-[11px] outline-none mt-1"
            style={{ background: 'white', color: '#3A3226' }}
          />
        </div>
      ))}

      {drafts.length < MAX_QUESTIONS && (
        <button
          onClick={() => setDrafts((p) => [...p, newDraft()])}
          className="w-full rounded-2xl py-3 mb-3 text-xs font-bold border-2 border-dashed"
          style={{ borderColor: '#7B4B9480', color: '#7B4B94' }}
        >
          + 문제 추가 ({drafts.length}/{MAX_QUESTIONS})
        </button>
      )}

      {error && (
        <div className="text-[11px] font-bold mb-2" style={{ color: '#C0392B' }}>{error}</div>
      )}

      {confirmMsg && (
        <div className="rounded-2xl p-3.5 mb-2" style={{ background: '#FFF1D6', border: '1px solid #F0D9A8' }}>
          <div className="text-[12px] font-bold mb-1" style={{ color: '#A6762A' }}>{confirmMsg}</div>
          <div className="text-[10px] leading-relaxed mb-2.5" style={{ color: '#A08A5B' }}>
            바뀐 문제로 다시 풀게 하려면 그대로 진행하고, 답안을 지키려면 취소하세요.
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setConfirmMsg('')}
              className="flex-1 rounded-xl py-2 text-[12px] font-bold"
              style={{ background: 'white', color: '#8A7A5F' }}
            >
              그만두기
            </button>
            <button
              onClick={() => { setConfirmMsg(''); save(true); }}
              disabled={saving}
              className="flex-1 rounded-xl py-2 text-[12px] font-bold text-white disabled:opacity-40"
              style={{ background: '#E8604C' }}
            >
              답안 지우고 고치기
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={onCancel}
          className="flex-1 rounded-xl py-2.5 text-sm font-bold"
          style={{ background: 'rgba(255,255,255,0.7)', color: '#8A7A5F' }}
        >
          취소
        </button>
        <button
          onClick={() => save()}
          disabled={saving || !title.trim()}
          className="flex-1 rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-40"
          style={{ background: '#7B4B94' }}
        >
          {saving ? '저장 중...' : edit ? '고치기' : '퀴즈 내기'}
        </button>
      </div>
    </div>
  );
}
