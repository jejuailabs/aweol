'use client';

import { useEffect, useRef, useState } from 'react';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { playSound } from '@/lib/sound';
import { CARE_LABEL, PET_KINDS, petLine, petMood } from '@/lib/school-pet';
import type { PetKind } from '@/lib/firestore-schema';

export interface PetState {
  kind: PetKind;
  name: string;
  fedAt: Date | null;
  wateredAt: Date | null;
  pettedAt: Date | null;
  careCount: number;
  lastCarerName: string;
}

/**
 * 동물을 돌보는 창.
 *
 * 먹이·물·쓰다듬기는 **필요할 때만** 눌린다. 배부른데 또 먹이면 의미가 없고,
 * 그걸 열어두면 아이가 버튼만 연타해서 쓰기가 폭발한다.
 * (careCount 도 규칙에서 한 번에 1씩만 늘게 막아뒀다)
 */
export default function SchoolPetPanel({
  schoolId, pet, onChanged, onClose,
}: {
  schoolId: string;
  pet: PetState;
  onChanged: (next: PetState) => void;
  onClose: () => void;
}) {
  const { user, userDoc } = useAuth();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [flash, setFlash] = useState('');
  const [turn, setTurn] = useState(0);
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(pet.name);
  const pressedBackdrop = useRef(false);

  const isStaff = (userDoc?.role === 'teacher' || userDoc?.role === 'super_admin')
    && (userDoc?.role === 'super_admin' || (userDoc?.schoolIds ?? []).includes(schoolId));

  const mood = petMood(pet.fedAt, pet.wateredAt, pet.pettedAt);
  const [line, setLine] = useState(() => petLine(mood.need, 0));

  // 말풍선은 몇 초마다 바뀐다. 계속 같은 말을 하면 인형처럼 보인다.
  useEffect(() => {
    const t = setInterval(() => setTurn((n) => n + 1), 6000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => { setLine(petLine(mood.need, turn)); }, [turn, mood.need]);

  const care = async (what: 'food' | 'water' | 'pet') => {
    if (!db || !user || busy) return;
    setBusy(true); setErr('');
    const field = what === 'food' ? 'fedAt' : what === 'water' ? 'wateredAt' : 'pettedAt';
    try {
      await updateDoc(doc(db, 'schools', schoolId, 'pet', 'main'), {
        [field]: serverTimestamp(),
        careCount: pet.careCount + 1,
        lastCarerName: userDoc?.displayName || '누군가',
      });
      const now = new Date();
      onChanged({
        ...pet,
        [field]: now,
        careCount: pet.careCount + 1,
        lastCarerName: userDoc?.displayName || '누군가',
      });
      setFlash(CARE_LABEL[what].done);
      setTimeout(() => setFlash(''), 1800);
      playSound('success');
    } catch (e) {
      setErr(String(e).slice(0, 70));
      playSound('error');
    }
    setBusy(false);
  };

  const rename = async () => {
    if (!db || !newName.trim()) return;
    setBusy(true); setErr('');
    try {
      await updateDoc(doc(db, 'schools', schoolId, 'pet', 'main'), { name: newName.trim().slice(0, 12) });
      onChanged({ ...pet, name: newName.trim().slice(0, 12) });
      setRenaming(false);
      playSound('success');
    } catch (e) { setErr(String(e).slice(0, 70)); playSound('error'); }
    setBusy(false);
  };

  const bar = (label: string, emoji: string, v: number) => (
    <div className="flex items-center gap-2">
      <span className="text-sm w-5 text-center">{emoji}</span>
      <span className="text-[10px] font-bold w-9 shrink-0" style={{ color: '#A89880' }}>{label}</span>
      <div className="flex-1 h-2.5 rounded-full overflow-hidden" style={{ background: '#EFE6D4' }}>
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${Math.round((1 - v) * 100)}%`,
            background: v > 0.7 ? '#E8493C' : v > 0.4 ? '#E8A33C' : '#6FBF73',
          }}
        />
      </div>
    </div>
  );

  const kindLabel = PET_KINDS.find((k) => k.kind === pet.kind);

  return (
    <div
      className="fixed inset-0 z-[85] flex items-end sm:items-center justify-center px-4 py-6"
      style={{ background: 'rgba(24,20,16,0.5)', backdropFilter: 'blur(6px)' }}
      onPointerDown={(e) => { pressedBackdrop.current = e.target === e.currentTarget; }}
      onClick={(e) => {
        if (e.target !== e.currentTarget || !pressedBackdrop.current) return;
        pressedBackdrop.current = false;
        if (busy) return;
        onClose();
      }}
    >
      <div
        className="w-full max-w-[380px] rounded-[28px] overflow-hidden"
        style={{ background: 'rgba(255,250,240,0.97)', border: '3px solid rgba(255,255,255,0.7)' }}
      >
        <div className="px-5 pt-4 pb-3 flex items-center" style={{ background: 'linear-gradient(135deg, #FFD98Add, #E8A33C99)' }}>
          <div className="min-w-0">
            <div className="text-base font-black text-white truncate">
              {kindLabel?.emoji} {pet.name}
            </div>
            <div className="text-[10px] text-white opacity-85">
              우리 학교 {kindLabel?.label} · 함께 돌본 횟수 {pet.careCount}번
            </div>
          </div>
          <button
            onClick={onClose}
            className="ml-auto h-8 w-8 rounded-full text-sm shrink-0"
            style={{ background: 'rgba(255,255,255,0.3)', color: 'white' }}
          >
            ✕
          </button>
        </div>

        <div className="px-5 py-4">
          {/* 말풍선 */}
          <div
            className="rounded-2xl px-4 py-3 mb-3 text-sm text-center leading-relaxed"
            style={{ background: 'white', color: '#3A3226' }}
          >
            <span className="text-lg mr-1">{mood.emoji}</span>
            {flash || line}
          </div>

          <div className="flex flex-col gap-1.5 mb-4">
            {bar('배부름', '🍚', mood.hunger)}
            {bar('물', '💧', mood.thirst)}
            {bar('기분', '💛', mood.lonely)}
          </div>

          {/* 돌보기 */}
          <div className="grid grid-cols-3 gap-2 mb-2">
            {(['food', 'water', 'pet'] as const).map((k) => {
              const v = k === 'food' ? mood.hunger : k === 'water' ? mood.thirst : mood.lonely;
              // 충분히 채워져 있으면 못 누른다 — 배부른데 또 먹이는 건 놀이가 아니다
              const full = v < 0.15;
              return (
                <button
                  key={k}
                  onClick={() => care(k)}
                  disabled={busy || full || !user}
                  className="rounded-2xl py-3 flex flex-col items-center gap-1 disabled:opacity-40"
                  style={{ background: 'white' }}
                >
                  <span className="text-2xl">{CARE_LABEL[k].emoji}</span>
                  <span className="text-[10px] font-bold" style={{ color: '#8A7A5F' }}>
                    {full ? '충분해요' : CARE_LABEL[k].label}
                  </span>
                </button>
              );
            })}
          </div>

          {!user && (
            <div className="text-[10px] text-center mb-2" style={{ color: '#A89880' }}>
              로그인하면 돌볼 수 있어요
            </div>
          )}
          {pet.lastCarerName && (
            <div className="text-[10px] text-center" style={{ color: '#A89880' }}>
              마지막으로 돌본 사람: {pet.lastCarerName}
            </div>
          )}
          {err && <div className="text-[10px] font-bold mt-2 text-center" style={{ color: '#C0392B' }}>{err}</div>}

          {/* 선생님만 이름 바꾸기 */}
          {isStaff && (
            renaming ? (
              <div className="flex gap-1.5 mt-3">
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  maxLength={12}
                  className="flex-1 min-w-0 rounded-xl px-3 py-2 text-sm outline-none"
                  style={{ background: 'white', color: '#3A3226' }}
                />
                <button
                  onClick={rename}
                  disabled={busy || !newName.trim()}
                  className="shrink-0 rounded-xl px-3 text-[11px] font-bold text-white disabled:opacity-40"
                  style={{ background: 'var(--color-primary)' }}
                >
                  저장
                </button>
              </div>
            ) : (
              <button
                onClick={() => setRenaming(true)}
                className="w-full text-[10px] underline mt-3"
                style={{ color: '#A89880' }}
              >
                이름 바꾸기
              </button>
            )
          )}
        </div>
      </div>
    </div>
  );
}

/** 학교 동물 읽기. 없으면 null — 선생님이 만들기 전까지는 운동장에 아무도 없다. */
export async function loadPet(schoolId: string): Promise<PetState | null> {
  if (!db) return null;
  const snap = await getDoc(doc(db, 'schools', schoolId, 'pet', 'main'));
  if (!snap.exists()) return null;
  const v = snap.data();
  const at = (k: string) => (v[k]?.toDate ? (v[k].toDate() as Date) : null);
  return {
    kind: (v.kind as PetKind) || 'dog',
    name: (v.name as string) || '친구',
    fedAt: at('fedAt'),
    wateredAt: at('wateredAt'),
    pettedAt: at('pettedAt'),
    careCount: (v.careCount as number) ?? 0,
    lastCarerName: (v.lastCarerName as string) || '',
  };
}

/** 교직원이 학교 동물을 들인다 */
export async function createPet(schoolId: string, kind: PetKind, name: string) {
  if (!db) return;
  await setDoc(doc(db, 'schools', schoolId, 'pet', 'main'), {
    kind,
    name: name.trim().slice(0, 12) || '친구',
    fedAt: serverTimestamp(),
    wateredAt: serverTimestamp(),
    pettedAt: serverTimestamp(),
    careCount: 0,
    lastCarerName: '',
  });
}
