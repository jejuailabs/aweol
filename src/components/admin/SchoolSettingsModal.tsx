'use client';

import { useState, useRef, useCallback } from 'react';
import { auth } from '@/lib/firebase';
import SchoolProfileFields, { EMPTY_PROFILE } from './SchoolProfileFields';
import type { SchoolProfile } from '@/lib/firestore-schema';

/**
 * 학교 정보 수정.
 *
 * 학교를 만들 때 한 번 정하고 끝이던 이름·대표 이미지·학년/반을 나중에 고칠 수 있게 한다.
 * 학년·반은 늘리기만 된다 — 줄이면 그 반의 작품·숙제가 통째로 사라지기 때문이다.
 */

export interface SchoolSettings {
  id: string;
  name: string;
  tagline: string;
  imageUrl: string;
  gradeCount: number;
  classPerGrade: number;
  emblemUrl?: string;
  profile?: SchoolProfile;
  /** 'gallery' 면 전시관. 없으면 학교. */
  kind?: 'school' | 'gallery';
}

export default function SchoolSettingsModal({
  school,
  isSuper,
  onSaved,
  onClose,
}: {
  school: SchoolSettings;
  /**
   * 총관리자인가.
   * 아니면 학교 상징·교표만 보인다 — 이름·위치·학년/반은 담임 한 명이 바꾸면
   * 학교 전체가 따라 바뀌고, 학년/반은 되돌릴 수도 없다. 서버도 같은 선을 긋는다.
   */
  isSuper: boolean;
  onSaved: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(school.name);
  const [tagline, setTagline] = useState(school.tagline || '');
  /** 학교냐 전시관이냐. 전시관은 문패 대신 배너를 걸고 교실을 건너뛴다. */
  const [kind, setKind] = useState<'school' | 'gallery'>(school.kind === 'gallery' ? 'gallery' : 'school');
  const [gradeCount, setGradeCount] = useState(school.gradeCount || 6);
  const [classPerGrade, setClassPerGrade] = useState(school.classPerGrade || 4);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [preview, setPreview] = useState(school.imageUrl || '');
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [profile, setProfile] = useState<SchoolProfile>(school.profile ?? EMPTY_PROFILE);
  // 기존 교표 주소로 시작하고, 새로 만들면 dataURL 로 바뀐다
  const [emblem, setEmblem] = useState(school.emblemUrl || '');
  const fileRef = useRef<HTMLInputElement>(null);
  const pressedBackdrop = useRef(false);

  const generate = useCallback(async () => {
    setGenerating(true);
    setError('');
    try {
      const token = await auth?.currentUser?.getIdToken();
      const res = await fetch('/api/school-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name, tagline }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setError(json.error || '그림을 만들지 못했어요'); return; }
      setGenerated(json.dataUrl || '');
      setPreview(json.dataUrl || '');
      setImageFile(null);
    } finally {
      setGenerating(false);
    }
  }, [name, tagline]);

  const save = useCallback(async () => {
    setSaving(true);
    setError('');
    setMsg('');
    try {
      const token = await auth?.currentUser?.getIdToken();
      const form = new FormData();
      form.set('schoolId', school.id);
      form.set('name', name.trim());
      form.set('tagline', tagline.trim());
      form.set('gradeCount', String(gradeCount));
      form.set('classPerGrade', String(classPerGrade));
      if (isSuper) form.set('kind', kind);
      if (imageFile) form.set('image', imageFile);
      else if (generated) form.set('imageDataUrl', generated);
      form.set('profile', JSON.stringify(profile));
      // 바뀌지 않았으면 기존 주소 그대로라 보내지 않는다
      if (emblem.startsWith('data:')) form.set('emblemDataUrl', emblem);

      const res = await fetch('/api/school', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setError(json.error || '저장하지 못했어요'); return; }
      setMsg(json.addedClasses ? `저장했어요 · 반 ${json.addedClasses}개를 새로 만들었어요` : '저장했어요');
      onSaved();
    } finally {
      setSaving(false);
    }
  }, [school.id, name, tagline, gradeCount, classPerGrade, imageFile, generated, profile, emblem, kind, isSuper, onSaved]);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center px-4 py-6"
      style={{ background: 'rgba(24,20,16,0.55)' }}
      // 안에서 눌러 바깥에서 뗀 드래그로 닫히지 않게 한다 (학교 만들기에서 겪은 문제)
      onPointerDown={(e) => { pressedBackdrop.current = e.target === e.currentTarget; }}
      onClick={(e) => {
        if (e.target !== e.currentTarget || !pressedBackdrop.current) return;
        pressedBackdrop.current = false;
        if (generating || saving) return;
        onClose();
      }}
    >
      <div
        className="w-full max-w-[460px] rounded-3xl p-5 max-h-[90vh] overflow-y-auto"
        style={{ background: 'var(--color-surface)' }}
      >
        <div className="flex items-center mb-4">
          <div className="text-base font-black" style={{ color: 'var(--color-text-main)' }}>
            🏫 학교 정보 수정
          </div>
          <button
            onClick={onClose}
            className="ml-auto rounded-full h-8 w-8 text-sm font-bold"
            style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-sub)' }}
          >
            ✕
          </button>
        </div>

        {isSuper && (
        <>
        <label className="block text-[13px] font-bold mb-1" style={{ color: 'var(--color-text-sub)' }}>
          학교 이름
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-xl px-3 py-2.5 text-sm outline-none mb-3"
          style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-main)' }}
        />

        <label className="block text-[13px] font-bold mb-1" style={{ color: 'var(--color-text-sub)' }}>
          한 줄 소개
        </label>
        <input
          value={tagline}
          onChange={(e) => setTagline(e.target.value)}
          placeholder="지도 마커에 함께 보여요"
          className="w-full rounded-xl px-3 py-2.5 text-sm outline-none mb-3"
          style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-main)' }}
        />

        {/*
          학교냐 전시관이냐 — 총관리자만.
          이걸 바꾸면 건물 앞면과 눌렀을 때 가는 곳이 통째로 달라진다.
        */}
        {isSuper && (
          <>
            <label className="block text-[13px] font-bold mb-1" style={{ color: 'var(--color-text-sub)' }}>
              어떤 곳인가요
            </label>
            <div className="flex gap-2 mb-1.5">
              {([
                ['school', '🏫 학교', '반마다 교실이 있어요'],
                ['gallery', '🎨 전시관', '반 대신 전시 주제로 나눠요'],
              ] as const).map(([k, label, desc]) => (
                <button
                  key={k}
                  type="button"
                  /**
                   * **이미 있는 곳의 종류를 바꾸는 것은 한 번 물어본다.**
                   *
                   * 애월초등학교가 전시관으로 바뀌어 있던 적이 있다(2026-07-23).
                   * 새 전시관을 열려던 것이었는데, 그때는 만드는 화면에 종류 고르는
                   * 칸이 없어서 **남의 학교 설정을 열어 바꾸는 것 말고는 길이 없었다.**
                   * 만드는 쪽 길은 열어뒀고(SchoolCreateModal), 여기서는
                   * 이름을 대며 한 번 더 묻는다 — 아이들이 쓰던 곳이니까.
                   */
                  onClick={() => {
                    const cur = school.kind === 'gallery' ? 'gallery' : 'school';
                    if (k !== cur && !window.confirm(
                      `'${school.name}' 을(를) ${k === 'gallery' ? '전시관' : '학교'}으로 바꿀까요?\n\n`
                      + '건물 앞면과 눌렀을 때 가는 곳이 통째로 달라집니다.\n'
                      + '새로 만들려던 것이라면 지도에서 "새로 만들기" 를 쓰세요.'
                    )) return;
                    setKind(k);
                  }}
                  className="flex-1 rounded-xl px-3 py-2.5 text-left"
                  style={
                    kind === k
                      ? { background: 'var(--color-primary)', color: 'white' }
                      : { background: 'var(--color-surface-soft)', color: 'var(--color-text-sub)' }
                  }
                >
                  <div className="text-[14px] font-black">{label}</div>
                  <div className="text-[12px] opacity-85 leading-snug">{desc}</div>
                </button>
              ))}
            </div>
            <p className="text-[12px] mb-3 leading-relaxed" style={{ color: 'var(--color-text-sub)' }}>
              전시관은 창문 문패 대신 건물에 <b>큰 배너</b>가 걸리고, 누르면 교실을 건너뛰고
              전시로 바로 들어가요. 주제 이름은 아래 반 목록에서 반마다 붙여주세요.
            </p>
          </>
        )}

        <label className="block text-[13px] font-bold mb-1" style={{ color: 'var(--color-text-sub)' }}>
          대표 이미지
        </label>
        <div
          className="rounded-2xl mb-2 overflow-hidden flex items-center justify-center"
          style={{ background: 'var(--color-surface-soft)', minHeight: 150 }}
        >
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="" className="w-full object-cover" style={{ maxHeight: 200 }} />
          ) : (
            <span className="text-[13px]" style={{ color: 'var(--color-text-sub)' }}>
              아직 이미지가 없어요
            </span>
          )}
        </div>
        <div className="flex gap-2 mb-4">
          <button
            onClick={generate}
            disabled={generating || saving}
            className="flex-1 rounded-xl py-2.5 text-[14px] font-bold text-white disabled:opacity-50"
            style={{ background: '#7B4B94' }}
          >
            {generating ? '✨ 만드는 중...' : '✨ AI로 새로 만들기'}
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={generating || saving}
            className="flex-1 rounded-xl py-2.5 text-[14px] font-bold disabled:opacity-50"
            style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-sub)' }}
          >
            📷 직접 올리기
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setImageFile(f);
              setGenerated('');
              setPreview(URL.createObjectURL(f));
            }}
          />
        </div>

        </>
        )}

        <label className="block text-[13px] font-bold mb-1" style={{ color: 'var(--color-text-sub)' }}>
          학교 상징 · 교표
        </label>
        <div className="mb-3">
          <SchoolProfileFields
            schoolName={name}
            schoolId={school.id}
            profile={profile}
            onProfile={setProfile}
            emblemPreview={emblem}
            onEmblem={setEmblem}
          />
        </div>

        {isSuper && (
        <>
        <label className="block text-[13px] font-bold mb-1" style={{ color: 'var(--color-text-sub)' }}>
          학년 · 반
        </label>
        <div className="flex gap-2 mb-1">
          <div className="flex-1">
            <div className="text-[12px] mb-1" style={{ color: 'var(--color-text-sub)' }}>학년 수</div>
            <input
              type="number" min={school.gradeCount || 1} max={6} value={gradeCount}
              onChange={(e) => setGradeCount(Number(e.target.value))}
              className="w-full rounded-xl px-3 py-2 text-sm outline-none"
              style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-main)' }}
            />
          </div>
          <div className="flex-1">
            <div className="text-[12px] mb-1" style={{ color: 'var(--color-text-sub)' }}>학년당 반</div>
            <input
              type="number" min={school.classPerGrade || 1} max={12} value={classPerGrade}
              onChange={(e) => setClassPerGrade(Number(e.target.value))}
              className="w-full rounded-xl px-3 py-2 text-sm outline-none"
              style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-main)' }}
            />
          </div>
        </div>
        <div className="text-[12px] mb-4 leading-relaxed" style={{ color: 'var(--color-text-sub)' }}>
          늘리면 없던 반만 새로 만들어요. <b>줄이는 건 막아뒀어요</b> — 그 반의 작품과 숙제가
          통째로 사라지기 때문이에요. 안 쓰는 반은 반별로 보관 처리해 주세요.
        </div>
        </>
        )}

        {!isSuper && (
          <div className="text-[12px] mb-4 leading-relaxed" style={{ color: 'var(--color-text-sub)' }}>
            학교 이름·위치·학년/반 수는 총관리자만 바꿀 수 있어요.
            학교 전체가 따라 바뀌는 것들이라서요.
          </div>
        )}

        {error && (
          <div className="text-[14px] font-bold mb-2" style={{ color: '#C0392B' }}>{error}</div>
        )}
        {msg && (
          <div className="text-[14px] font-bold mb-2" style={{ color: 'var(--color-primary)' }}>{msg}</div>
        )}

        <button
          onClick={save}
          disabled={saving || generating || !name.trim()}
          className="w-full rounded-full py-3 text-sm font-bold text-white disabled:opacity-50"
          style={{ background: 'var(--color-primary)' }}
        >
          {saving ? '저장 중...' : '저장하기'}
        </button>
      </div>
    </div>
  );
}
