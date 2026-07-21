'use client';

import { useState, useRef, useCallback } from 'react';
import { auth } from '@/lib/firebase';

/**
 * 틀린그림 찾기 출제.
 *
 * AI가 정확히 몇 군데를 바꿔줄지는 알 수 없다. 그래서 AI가 만든 그림을 정답으로 삼지 않고,
 * **선생님이 두 그림을 보고 다른 곳을 직접 찍어** 정답을 정한다.
 * 찍은 좌표는 서버의 answerKey 로만 들어가고 아이들에게는 내려가지 않는다.
 */

interface Spot { x: number; y: number; r: number }

export default function SpotCompose({
  schoolId, classId, onDone, onCancel,
}: {
  schoolId: string;
  classId: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState('');
  const [vis, setVis] = useState<'class' | 'teacher'>('class');
  const [originalUrl, setOriginalUrl] = useState('');
  const [variantUrl, setVariantUrl] = useState('');
  const [layout, setLayout] = useState<'vertical' | 'horizontal'>('vertical');
  const [spots, setSpots] = useState<Spot[]>([]);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const generate = useCallback(async (file: File) => {
    setGenerating(true);
    setError('');
    setSpots([]);
    try {
      const token = await auth?.currentUser?.getIdToken();
      const fd = new FormData();
      fd.append('image', file);
      const res = await fetch('/api/spot-generate', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setError(json.error || '만들지 못했어요'); return; }
      setOriginalUrl(json.originalDataUrl);
      setVariantUrl(json.variantDataUrl);
      setLayout(json.layout === 'horizontal' ? 'horizontal' : 'vertical');
    } finally {
      setGenerating(false);
    }
  }, []);

  /** 변형 그림 위에서 다른 곳을 찍는다 */
  const markSpot = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    setSpots((prev) => (prev.length >= 10 ? prev : [...prev, { x, y, r: 0.07 }]));
  };

  const save = useCallback(async () => {
    setSaving(true);
    setError('');
    try {
      const token = await auth?.currentUser?.getIdToken();
      const res = await fetch('/api/spot-game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          schoolId, classId, title, visibility: vis, layout, spots,
          originalDataUrl: originalUrl, variantDataUrl: variantUrl,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setError(json.error || '내지 못했어요'); return; }
      onDone();
    } finally {
      setSaving(false);
    }
  }, [schoolId, classId, title, vis, layout, spots, originalUrl, variantUrl, onDone]);

  return (
    <div>
      <button onClick={onCancel} className="text-[13px] font-bold mb-2.5" style={{ color: '#8A7A5F' }}>
        ← 놀이 목록
      </button>
      <div className="text-sm font-black mb-3" style={{ color: '#3A3226' }}>🔍 틀린그림 찾기 만들기</div>

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="제목 (예: 우리 교실 사진에서 찾아봐요)"
        className="w-full rounded-xl px-3 py-2.5 text-sm outline-none mb-2"
        style={{ background: 'rgba(255,255,255,0.9)', color: '#3A3226' }}
      />

      <div className="flex gap-1.5 mb-3">
        {([
          { v: 'class' as const, label: '👀 아이들과 함께' },
          { v: 'teacher' as const, label: '🔒 선생님만' },
        ]).map((o) => (
          <button
            key={o.v}
            onClick={() => setVis(o.v)}
            className="flex-1 rounded-xl py-2.5 text-[13px] font-bold"
            style={{
              background: vis === o.v ? '#E8A33C' : 'rgba(255,255,255,0.85)',
              color: vis === o.v ? 'white' : '#8A7A5F',
            }}
          >
            {o.label}
          </button>
        ))}
      </div>

      {!originalUrl ? (
        <>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={generating}
            className="w-full rounded-2xl py-10 flex flex-col items-center gap-2 border-2 border-dashed disabled:opacity-50"
            style={{ borderColor: '#E8A33C80', background: 'rgba(255,255,255,0.7)' }}
          >
            <span className="text-3xl">{generating ? '✨' : '📷'}</span>
            <span className="text-[14px] font-bold" style={{ color: '#A6762A' }}>
              {generating ? 'AI가 다른 그림을 만드는 중...' : '사진 고르기'}
            </span>
            <span className="text-[12px]" style={{ color: '#A89880' }}>
              교실·운동장 사진이면 아이들이 더 재밌어해요
            </span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) generate(f);
              e.target.value = '';
            }}
          />
        </>
      ) : (
        <>
          <div className="rounded-xl px-3 py-2 mb-2 text-[13px] leading-relaxed" style={{ background: '#FFF1D6', color: '#A6762A' }}>
            두 그림을 비교해서 <b>다른 곳을 아래 그림에서 눌러주세요</b>.
            AI가 정확히 몇 군데를 바꿨는지는 알 수 없어서, 선생님이 찍은 곳만 정답이 됩니다.
          </div>

          <div className={`flex gap-2 mb-2 ${layout === 'horizontal' ? 'flex-row' : 'flex-col'}`}>
            <div className="flex-1">
              <div className="text-[12px] font-bold mb-1" style={{ color: '#8A7A5F' }}>원본</div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={originalUrl} alt="원본" className="w-full rounded-xl" />
            </div>
            <div className="flex-1">
              <div className="text-[12px] font-bold mb-1" style={{ color: '#8A7A5F' }}>
                바뀐 그림 — 눌러서 표시 ({spots.length}/10)
              </div>
              <div className="relative cursor-crosshair" onClick={markSpot}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={variantUrl} alt="바뀐 그림" className="w-full rounded-xl select-none" draggable={false} />
                {spots.map((s, i) => (
                  <div
                    key={i}
                    className="absolute rounded-full flex items-center justify-center text-[13px] font-bold text-white pointer-events-none"
                    style={{
                      left: `${s.x * 100}%`,
                      top: `${s.y * 100}%`,
                      width: `${s.r * 200}%`,
                      aspectRatio: '1',
                      transform: 'translate(-50%, -50%)',
                      border: '3px solid #E8604C',
                      background: 'rgba(232,96,76,0.25)',
                    }}
                  >
                    {i + 1}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex gap-2 mb-2">
            <button
              onClick={() => setSpots((p) => p.slice(0, -1))}
              disabled={spots.length === 0}
              className="rounded-xl px-4 py-2.5 text-[14px] font-bold disabled:opacity-40"
              style={{ background: 'white', color: '#8A7A5F' }}
            >
              ↩︎ 하나 취소
            </button>
            <button
              onClick={() => { setOriginalUrl(''); setVariantUrl(''); setSpots([]); }}
              className="rounded-xl px-4 py-2.5 text-[14px] font-bold"
              style={{ background: 'white', color: '#8A7A5F' }}
            >
              다른 사진으로
            </button>
          </div>
        </>
      )}

      {error && <div className="text-[13px] font-bold mb-2" style={{ color: '#C0392B' }}>{error}</div>}

      <div className="flex gap-2">
        <button
          onClick={onCancel}
          className="flex-1 rounded-xl py-2.5 text-sm font-bold"
          style={{ background: 'rgba(255,255,255,0.7)', color: '#8A7A5F' }}
        >
          취소
        </button>
        <button
          onClick={save}
          disabled={saving || !title.trim() || spots.length === 0 || !originalUrl}
          className="flex-1 rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-40"
          style={{ background: '#E8A33C' }}
        >
          {saving ? '내는 중...' : '놀이 내기'}
        </button>
      </div>
    </div>
  );
}
