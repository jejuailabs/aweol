'use client';

import { useState, useRef } from 'react';
import { auth } from '@/lib/firebase';
import { playSound } from '@/lib/sound';

const ASSET_OPTIONS = [
  { key: 'rainbow', label: '🌈 무지개' },
  { key: 'playground', label: '🏃 운동장' },
  { key: 'flowers', label: '🌸 꽃밭' },
  { key: 'trees', label: '🌳 나무숲' },
];

/** 슈퍼 관리자가 지도에 새 학교를 올리는 모달 */
export default function SchoolCreateModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [tagline, setTagline] = useState('');
  const [addressQuery, setAddressQuery] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchMsg, setSearchMsg] = useState('');
  const [gradeCount, setGradeCount] = useState(6);
  const [classPerGrade, setClassPerGrade] = useState(4);
  const [assets, setAssets] = useState<string[]>(['trees', 'flowers']);

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState('');
  const [generating, setGenerating] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  /** 배경을 '눌러서' 시작했는지 — 드래그로 닫히는 걸 막는다 */
  const pressedBackdrop = useRef(false);

  /** 주소 → 좌표 (OpenStreetMap Nominatim, 키 불필요) */
  const searchAddress = async () => {
    if (!addressQuery.trim()) return;
    setSearching(true);
    setSearchMsg('');
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(addressQuery)}`,
        { headers: { 'Accept-Language': 'ko' } }
      );
      const json = await res.json();
      if (Array.isArray(json) && json.length > 0) {
        setCoords({ lat: parseFloat(json[0].lat), lng: parseFloat(json[0].lon) });
        setSearchMsg(`📍 ${json[0].display_name}`);
        if (!name.trim()) setName(addressQuery.trim());
      } else {
        setSearchMsg('그 주소를 찾지 못했어요. 더 자세히 적어보세요.');
      }
    } catch {
      setSearchMsg('주소 검색에 실패했어요.');
    }
    setSearching(false);
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setImageFile(f);
    setImagePreview(URL.createObjectURL(f));
  };

  const generateImage = async () => {
    if (!name.trim()) { setError('학교 이름을 먼저 적어주세요'); return; }
    setGenerating(true);
    setError('');
    try {
      const token = await auth?.currentUser?.getIdToken();
      const res = await fetch('/api/school-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: name.trim(), assets }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '생성 실패');
      setImagePreview(json.dataUrl);
      setImageFile(null);
      playSound('success');
    } catch (e) {
      setError((e as Error).message);
      playSound('error');
    }
    setGenerating(false);
  };

  const submit = async () => {
    if (!name.trim() || !coords) return;
    setSaving(true);
    setError('');
    try {
      const token = await auth?.currentUser?.getIdToken();
      const form = new FormData();
      form.append('name', name.trim());
      form.append('tagline', tagline.trim());
      form.append('lat', String(coords.lat));
      form.append('lng', String(coords.lng));
      form.append('gradeCount', String(gradeCount));
      form.append('classPerGrade', String(classPerGrade));
      form.append('assets', JSON.stringify(assets));
      if (imageFile) form.append('image', imageFile);
      else if (imagePreview.startsWith('data:')) form.append('imageDataUrl', imagePreview);

      const res = await fetch('/api/school', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '학교를 만들지 못했어요');
      playSound('success');
      onCreated();
    } catch (e) {
      setError((e as Error).message);
      playSound('error');
      setSaving(false);
    }
  };

  return (
    <div
      className="modal-backdrop fixed inset-0 z-[70] flex items-center justify-center px-4 py-6"
      style={{ background: 'rgba(24,20,16,0.55)', backdropFilter: 'blur(8px)' }}
      /**
       * 바깥을 눌러서 닫되, **누르기 시작한 곳이 바깥일 때만** 닫는다.
       * click 만 보면 모달 안에서 눌러 바깥에서 뗀 드래그도 공통 조상(=배경)에서
       * click 이 터져 그대로 닫혔다. 주소 입력이나 이미지 생성 중에 살짝만 끌어도
       * 만들던 게 통째로 날아갔다.
       */
      onPointerDown={(e) => { pressedBackdrop.current = e.target === e.currentTarget; }}
      onClick={(e) => {
        if (e.target !== e.currentTarget || !pressedBackdrop.current) return;
        pressedBackdrop.current = false;
        // 만드는 중에 실수로 닫으면 생성한 이미지가 사라진다
        if (generating || saving) return;
        onClose();
      }}
    >
      <div
        className="modal-card w-full max-w-[460px] rounded-[28px] overflow-hidden flex flex-col"
        style={{ maxHeight: '90vh', background: 'rgba(255,250,240,0.95)', border: '3px solid rgba(255,255,255,0.7)' }}
      >
        <div className="px-5 pt-4 pb-3 flex items-center justify-between" style={{ background: 'linear-gradient(135deg, #8FD98Add, #6AB56599)' }}>
          <div>
            <div className="text-base font-black text-white">🏫 새 학교 만들기</div>
            <div className="text-[10px] text-white opacity-80">지도에 마커가 생기고 3D 학교가 열려요</div>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-full text-sm"
            style={{ background: 'rgba(255,255,255,0.3)', color: 'white' }}
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* 위치 */}
          <div className="text-[11px] font-bold mb-1.5" style={{ color: '#8A7A5F' }}>1. 어디에 있나요? *</div>
          <div className="flex gap-2 mb-1.5">
            <input
              value={addressQuery}
              onChange={(e) => setAddressQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) searchAddress(); }}
              placeholder="예: 제주 애월초등학교"
              className="min-w-0 flex-1 rounded-xl px-3 py-2.5 text-sm outline-none"
              style={{ background: 'white', color: '#3A3226' }}
            />
            <button
              onClick={searchAddress}
              disabled={searching || !addressQuery.trim()}
              className="shrink-0 rounded-xl px-4 text-xs font-bold text-white disabled:opacity-40"
              style={{ background: '#4A90D9' }}
            >
              {searching ? '찾는 중' : '찾기'}
            </button>
          </div>
          {searchMsg && (
            <div className="text-[10px] mb-3 leading-relaxed" style={{ color: coords ? '#2E9E56' : '#C0392B' }}>
              {searchMsg}
            </div>
          )}

          {/* 이름 */}
          <div className="text-[11px] font-bold mb-1.5 mt-2" style={{ color: '#8A7A5F' }}>2. 학교 이름 *</div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="애월초등학교"
            className="w-full rounded-xl px-3 py-2.5 text-sm outline-none mb-2"
            style={{ background: 'white', color: '#3A3226' }}
          />
          <input
            value={tagline}
            onChange={(e) => setTagline(e.target.value)}
            placeholder="한 줄 소개 (선택)"
            className="w-full rounded-xl px-3 py-2.5 text-sm outline-none mb-4"
            style={{ background: 'white', color: '#3A3226' }}
          />

          {/* 대표 이미지 */}
          <div className="text-[11px] font-bold mb-1.5" style={{ color: '#8A7A5F' }}>3. 대표 이미지</div>
          <div
            className="w-full aspect-[3/2] rounded-xl mb-2 flex items-center justify-center overflow-hidden"
            style={{ background: 'white', border: '2px dashed #D8C9AC' }}
          >
            {imagePreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imagePreview} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="text-[11px]" style={{ color: '#A89880' }}>AI로 만들거나 직접 올려주세요</span>
            )}
          </div>
          <div className="flex gap-2 mb-4">
            <button
              onClick={generateImage}
              disabled={generating}
              className="flex-1 rounded-xl py-2.5 text-xs font-bold text-white disabled:opacity-50"
              style={{ background: '#7B4B94' }}
            >
              {generating ? '✨ 만드는 중...' : '✨ AI로 만들기'}
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              className="flex-1 rounded-xl py-2.5 text-xs font-bold"
              style={{ background: 'white', color: '#8A7A5F' }}
            >
              📷 직접 올리기
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
          </div>

          {/* 학년·반 */}
          <div className="text-[11px] font-bold mb-1.5" style={{ color: '#8A7A5F' }}>4. 학년 · 반</div>
          <div className="flex gap-2 mb-1.5">
            {([
              { label: '학년 수', value: gradeCount, set: setGradeCount, max: 6 },
              { label: '학년당 반', value: classPerGrade, set: setClassPerGrade, max: 12 },
            ]).map((f) => (
              <div key={f.label} className="flex-1">
                <div className="text-[10px] mb-1" style={{ color: '#A89880' }}>{f.label}</div>
                <input
                  type="number"
                  min={1}
                  max={f.max}
                  value={f.value}
                  onChange={(e) => f.set(Math.max(1, Math.min(f.max, parseInt(e.target.value, 10) || 1)))}
                  className="w-full rounded-xl px-3 py-2 text-sm outline-none"
                  style={{ background: 'white', color: '#3A3226' }}
                />
              </div>
            ))}
          </div>
          <div className="text-[10px] mb-4" style={{ color: '#A89880' }}>
            총 {gradeCount * classPerGrade}개 반이 자동으로 만들어져요
          </div>

          {/* 에셋 */}
          <div className="text-[11px] font-bold mb-1.5" style={{ color: '#8A7A5F' }}>5. 학교에 넣을 것 (선택)</div>
          <div className="flex flex-wrap gap-1.5 mb-4">
            {ASSET_OPTIONS.map((a) => {
              const on = assets.includes(a.key);
              return (
                <button
                  key={a.key}
                  onClick={() =>
                    setAssets((prev) => (on ? prev.filter((k) => k !== a.key) : [...prev, a.key]))
                  }
                  className="rounded-full px-3 py-1.5 text-[11px] font-bold"
                  style={{
                    background: on ? 'var(--color-primary)' : 'white',
                    color: on ? 'white' : '#8A7A5F',
                  }}
                >
                  {a.label}
                </button>
              );
            })}
          </div>

          {error && (
            <div className="text-[11px] font-bold mb-2" style={{ color: '#C0392B' }}>{error}</div>
          )}
        </div>

        <div className="px-5 pb-5 pt-2" style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}>
          <button
            onClick={submit}
            disabled={!name.trim() || !coords || saving}
            className="w-full rounded-xl py-3.5 text-sm font-bold text-white disabled:opacity-40"
            style={{ background: 'var(--color-primary)' }}
          >
            {saving ? '학교를 세우는 중...' : '지도에 학교 세우기 🏫'}
          </button>
          {!coords && (
            <div className="text-[10px] text-center mt-2" style={{ color: '#A89880' }}>
              먼저 위치를 찾아주세요
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
