'use client';

import { useRef, useState } from 'react';
import { auth } from '@/lib/firebase';
import { playSound } from '@/lib/sound';
import type { SchoolProfile } from '@/lib/firestore-schema';

export const EMPTY_PROFILE: SchoolProfile = {
  founded: '', motto: '', flower: '', tree: '', note: '', sources: [],
};

/**
 * 학교 상징 입력칸 + 교표.
 *
 * AI 조사는 **초안**이다. 실측해보니 개교연도는 잘 찾지만
 * 교훈·교화·교목은 학교 홈페이지에만 있어서 거의 못 찾는다(프레임·자바스크립트).
 * 못 찾은 칸은 빈 칸으로 두고 사람이 채운다 — 남의 학교 상징을 지어내면
 * 그 학교 아이들이 틀린 걸 자기 학교 것으로 배운다.
 */
export default function SchoolProfileFields({
  schoolName,
  address,
  profile,
  onProfile,
  emblemPreview,
  onEmblem,
}: {
  schoolName: string;
  address?: string;
  profile: SchoolProfile;
  onProfile: (p: SchoolProfile) => void;
  /** 지금 보여줄 교표 (기존 주소 또는 새로 만든 dataURL) */
  emblemPreview: string;
  /** 새 교표 dataURL. 안 바꾸면 호출되지 않는다 */
  onEmblem: (dataUrl: string) => void;
}) {
  const [researching, setResearching] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const set = (k: keyof SchoolProfile, v: string) => onProfile({ ...profile, [k]: v });

  const research = async () => {
    if (!schoolName.trim()) { setErr('학교 이름을 먼저 적어주세요'); return; }
    setResearching(true); setErr(''); setMsg('');
    try {
      const token = await auth?.currentUser?.getIdToken();
      const res = await fetch('/api/school-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: schoolName.trim(), address }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '조사 실패');

      const found = json.profile as SchoolProfile;
      // 이미 사람이 적어둔 칸은 덮지 않는다. 사람이 적은 게 언제나 우선이다.
      onProfile({
        founded: profile.founded || found.founded,
        motto: profile.motto || found.motto,
        flower: profile.flower || found.flower,
        tree: profile.tree || found.tree,
        note: profile.note || found.note,
        sources: found.sources,
      });

      const missing = (json.missing as string[]) || [];
      const KO: Record<string, string> = { founded: '개교연도', motto: '교훈', flower: '교화', tree: '교목' };
      setMsg(
        missing.length
          ? `찾은 것만 채웠어요. ${missing.map((m) => KO[m] ?? m).join('·')}은(는) 못 찾았으니 직접 적어주세요.`
          : '모두 찾았어요. 출처를 눌러 맞는지 확인해주세요.'
      );
      playSound('success');
    } catch (e) {
      setErr((e as Error).message);
      playSound('error');
    }
    setResearching(false);
  };

  const drawEmblem = async () => {
    if (!schoolName.trim()) { setErr('학교 이름을 먼저 적어주세요'); return; }
    setDrawing(true); setErr('');
    try {
      const token = await auth?.currentUser?.getIdToken();
      const res = await fetch('/api/school-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          kind: 'emblem', name: schoolName.trim(),
          flower: profile.flower, tree: profile.tree,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '생성 실패');
      onEmblem(json.dataUrl);
      playSound('success');
    } catch (e) {
      setErr((e as Error).message);
      playSound('error');
    }
    setDrawing(false);
  };

  const pickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => onEmblem(String(r.result));
    r.readAsDataURL(f);
  };

  const field = (k: keyof SchoolProfile, label: string, ph: string) => (
    <div className="flex-1 min-w-0">
      <div className="text-[10px] mb-1" style={{ color: '#A89880' }}>{label}</div>
      <input
        value={String(profile[k] ?? '')}
        onChange={(e) => set(k, e.target.value)}
        placeholder={ph}
        className="w-full rounded-xl px-3 py-2 text-sm outline-none"
        style={{ background: 'white', color: '#3A3226' }}
      />
    </div>
  );

  return (
    <div>
      <button
        onClick={research}
        disabled={researching}
        className="w-full rounded-xl py-2.5 text-xs font-bold text-white disabled:opacity-50 mb-1.5"
        style={{ background: '#4A90D9' }}
      >
        {researching ? '🔎 학교를 찾아보는 중...' : '🔎 AI로 학교 조사하기'}
      </button>
      <div className="text-[10px] mb-2 leading-relaxed" style={{ color: '#A89880' }}>
        AI가 웹에서 찾은 <b>초안</b>이에요. 개교연도는 잘 찾지만 교훈·교화·교목은
        학교 홈페이지에만 있어서 못 찾는 경우가 많아요. 반드시 확인하고 고쳐주세요.
      </div>
      {msg && <div className="text-[10px] mb-2 leading-relaxed" style={{ color: '#2E9E56' }}>{msg}</div>}
      {err && <div className="text-[10px] mb-2 font-bold" style={{ color: '#C0392B' }}>{err}</div>}

      <div className="flex gap-2 mb-2">
        {field('founded', '개교연도', '1923')}
        {field('flower', '교화 (꽃)', '동백꽃')}
        {field('tree', '교목 (나무)', '팽나무')}
      </div>
      <div className="mb-2">{field('motto', '교훈', '바르게 슬기롭게 튼튼하게')}</div>
      <div className="mb-2">
        <div className="text-[10px] mb-1" style={{ color: '#A89880' }}>학교 자랑 (한두 줄)</div>
        <textarea
          value={profile.note}
          onChange={(e) => set('note', e.target.value)}
          rows={2}
          placeholder="바다가 보이는 학교예요"
          className="w-full rounded-xl px-3 py-2 text-sm outline-none resize-none"
          style={{ background: 'white', color: '#3A3226' }}
        />
      </div>

      {profile.sources.length > 0 && (
        <div className="text-[10px] mb-3 leading-relaxed" style={{ color: '#A89880' }}>
          출처:{' '}
          {profile.sources.map((u, i) => (
            <a
              key={u}
              href={u}
              target="_blank"
              rel="noreferrer noopener"
              className="underline"
              style={{ color: '#4A90D9' }}
            >
              {i + 1}번{i < profile.sources.length - 1 ? ', ' : ''}
            </a>
          ))}
        </div>
      )}

      {/* 교표 */}
      <div className="text-[10px] mb-1" style={{ color: '#A89880' }}>
        교표 — 현관 위 동그란 자리에 걸려요
      </div>
      <div className="flex items-center gap-3 mb-2">
        <div
          className="shrink-0 rounded-full overflow-hidden flex items-center justify-center"
          style={{ width: 64, height: 64, background: 'white', border: '2px dashed #D8C9AC' }}
        >
          {emblemPreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={emblemPreview} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="text-[9px] text-center leading-tight" style={{ color: '#A89880' }}>비어<br />있음</span>
          )}
        </div>
        <div className="flex-1 flex flex-col gap-1.5">
          <button
            onClick={drawEmblem}
            disabled={drawing}
            className="rounded-xl py-2 text-[11px] font-bold text-white disabled:opacity-50"
            style={{ background: '#7B4B94' }}
          >
            {drawing ? '✨ 그리는 중...' : '✨ AI로 교표 만들기'}
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            className="rounded-xl py-2 text-[11px] font-bold"
            style={{ background: 'white', color: '#8A7A5F' }}
          >
            📷 진짜 교표 올리기
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickFile} />
        </div>
      </div>
      <div className="text-[10px] mb-4 leading-relaxed" style={{ color: '#A89880' }}>
        AI가 만든 건 <b>진짜 교표가 아니라</b> 교화·교목으로 새로 그린 마크예요.
        학교의 진짜 교표가 있으면 그걸 올려주세요.
      </div>
    </div>
  );
}
