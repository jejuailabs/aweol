'use client';

import { useEffect, useRef, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { playSound } from '@/lib/sound';
import {
  createCustomStamp, customStampsPath, deleteCustomStamp, type CustomStamp,
} from '@/lib/custom-stamps';

/**
 * 내 도장 만들기.
 *
 * 상점 도장은 이모지라 어느 반이든 똑같이 생겼다. 선생님이 자기 도장을 만들면
 * 아이가 '우리 선생님이 찍어준 것' 으로 느낀다.
 */
export default function MyStampMaker() {
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [stamps, setStamps] = useState<CustomStamp[]>([]);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!db || !user) { setStamps([]); return; }
    return onSnapshot(
      query(collection(db, customStampsPath(user.uid)), orderBy('createdAt', 'desc')),
      (snap) => setStamps(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CustomStamp, 'id'>) }))),
      () => setStamps([])
    );
  }, [user]);

  const pick = async (file: File | undefined) => {
    if (!file || !user) return;
    setBusy(true); setErr('');
    try {
      await createCustomStamp(user.uid, file, label);
      setLabel('');
      playSound('success');
    } catch {
      // 여기 오는 건 대개 용량·형식이다. 규칙은 조용히 거부하므로 말로 알려준다.
      setErr('도장을 만들지 못했어요. 사진 파일인지 확인하고 다시 해주세요.');
      playSound('error');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const remove = async (id: string) => {
    if (!user) return;
    setBusy(true); setErr('');
    try {
      await deleteCustomStamp(user.uid, id);
    } catch {
      setErr('도장을 지우지 못했어요.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-7">
      <h2 className="text-sm font-bold mb-0.5" style={{ color: 'var(--color-text-main)' }}>
        🖼️ 내가 만든 도장
      </h2>
      <p className="text-[12px] mb-3" style={{ color: 'var(--color-text-sub)' }}>
        직접 그리거나 찍은 그림을 도장으로 쓸 수 있어요. 작게 줄여서 보관해요.
      </p>

      <div className="flex gap-2 mb-3">
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={10}
          placeholder="도장 이름 (예: 참잘했어요)"
          className="flex-1 min-w-0 rounded-xl px-3 py-2.5 text-[14px] outline-none"
          style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-main)' }}
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="shrink-0 rounded-xl px-4 text-[14px] font-bold text-white disabled:opacity-40"
          style={{ background: 'var(--color-primary)' }}
        >
          {busy ? '만드는 중...' : '＋ 그림 고르기'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => pick(e.target.files?.[0])}
        />
      </div>

      {err && (
        <div className="text-[13px] font-bold mb-2" style={{ color: '#C0392B' }}>⚠️ {err}</div>
      )}

      {stamps.length === 0 ? (
        <div
          className="rounded-xl px-3 py-3 text-[13px] leading-relaxed"
          style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-sub)' }}
        >
          아직 만든 도장이 없어요. 그림을 고르면 여기에 생겨요.
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-3">
          {stamps.map((s) => (
            <div
              key={s.id}
              className="rounded-2xl p-2.5 text-center"
              style={{ background: 'var(--color-surface)' }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={s.imageUrl}
                alt={s.label}
                className="mx-auto h-12 w-12 rounded-lg object-cover mb-1.5"
              />
              <div className="text-[12px] font-bold truncate" style={{ color: 'var(--color-text-main)' }}>
                {s.label}
              </div>
              <button
                onClick={() => remove(s.id)}
                disabled={busy}
                className="mt-1 text-[12px] underline disabled:opacity-40"
                style={{ color: 'var(--color-text-sub)' }}
              >
                지우기
              </button>
            </div>
          ))}
        </div>
      )}

      {stamps.length > 0 && (
        <p className="text-[12px] mt-2 leading-relaxed" style={{ color: 'var(--color-text-sub)' }}>
          지워도 이미 찍어준 도장은 아이 숙제에 그대로 남아요.
        </p>
      )}
    </div>
  );
}
