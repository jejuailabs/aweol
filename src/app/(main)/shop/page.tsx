'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { canManageClass } from '@/lib/auth-helpers';
import { inventoryPath } from '@/lib/paths';
import { SHOP_ITEMS, ShopItem, ShopCategory } from '@/lib/shop-catalog';

export default function ShopPage() {
  const { user, userDoc, role } = useAuth();
  const isStaff = canManageClass(role);

  const [owned, setOwned] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<ShopItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const stamps = userDoc?.stamps ?? 0;
  const equipped = userDoc?.avatarCustom ?? { hat: null, accessory: null };

  useEffect(() => {
    if (!db || !user) { setOwned(new Set()); return; }
    return onSnapshot(
      collection(db, inventoryPath(user.uid)),
      (snap) => setOwned(new Set(snap.docs.map((d) => d.id))),
      () => setOwned(new Set())
    );
  }, [user]);

  const call = useCallback(async (body: Record<string, unknown>) => {
    setBusy(true);
    setMsg('');
    try {
      const token = await auth?.currentUser?.getIdToken();
      const res = await fetch('/api/shop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(json.error || '잘 안 됐어요'); return false; }
      return true;
    } finally {
      setBusy(false);
    }
  }, []);

  const buy = useCallback(async (item: ShopItem) => {
    if (await call({ action: 'buy', itemId: item.id })) {
      setMsg(item.price === 0 ? `${item.label} 받았어요!` : `${item.label} 샀어요!`);
    }
  }, [call]);

  const equip = useCallback(async (item: ShopItem, on: boolean) => {
    const slot = item.category;
    if (slot === 'stamp') return;
    if (await call({ action: 'equip', slot, itemId: on ? item.id : null })) {
      setMsg(on ? `${item.label} 꼈어요!` : `${item.label} 뺐어요`);
    }
  }, [call]);

  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(''), 2600);
    return () => clearTimeout(t);
  }, [msg]);

  const sections = useMemo(() => {
    const base: { key: ShopCategory; title: string; desc: string }[] = [
      { key: 'hat', title: '🎩 모자', desc: '머리에 하나만 쓸 수 있어요' },
      { key: 'accessory', title: '✨ 액세서리', desc: '하나만 낄 수 있어요' },
    ];
    // 도장 도안은 선생님 화면에서만 의미가 있다
    return isStaff
      ? [{ key: 'stamp' as ShopCategory, title: '💮 도장 도안', desc: '숙제 검사할 때 찍어줄 도장이에요 (지금은 전부 무료)' }, ...base]
      : base;
  }, [isStaff]);

  if (!user) {
    return (
      <div className="px-4 pt-8 pb-24 mx-auto max-w-[960px] text-center">
        <div className="text-5xl mb-3">🛒</div>
        <h1 className="text-lg font-bold mb-2" style={{ color: 'var(--color-text-main)' }}>꾸미기 상점</h1>
        <p className="text-xs" style={{ color: 'var(--color-text-sub)' }}>
          로그인하면 모은 도장으로 아바타를 꾸밀 수 있어요
        </p>
      </div>
    );
  }

  return (
    <div className="px-4 pt-8 pb-24 mx-auto max-w-[960px]">
      <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--color-text-main)' }}>🛒 꾸미기 상점</h1>
      <p className="text-xs mb-5" style={{ color: 'var(--color-text-sub)' }}>
        {isStaff
          ? '아이들에게 찍어줄 도장을 챙기고, 내 아바타도 꾸며보세요'
          : '숙제를 내고 검사를 받으면 도장이 쌓여요!'}
      </p>

      {/* 보유 도장 */}
      <div
        className="rounded-2xl p-4 mb-6 flex items-center justify-between shadow-md"
        style={{ background: 'linear-gradient(135deg, var(--color-accent-yellow) 0%, #FFE29A 100%)' }}
      >
        <span className="text-sm font-bold" style={{ color: '#7A5C00' }}>내 도장</span>
        <span className="text-lg font-bold" style={{ color: '#7A5C00' }}>🏅 {stamps}개</span>
      </div>

      {sections.map((sec) => (
        <div key={sec.key} className="mb-7">
          <h2 className="text-sm font-bold mb-0.5" style={{ color: 'var(--color-text-main)' }}>{sec.title}</h2>
          <p className="text-[10px] mb-3" style={{ color: 'var(--color-text-sub)' }}>{sec.desc}</p>
          <div className="grid grid-cols-4 gap-3">
            {SHOP_ITEMS.filter((i) => i.category === sec.key).map((item) => {
              const has = owned.has(item.id);
              const on = item.category !== 'stamp'
                && equipped[item.category as 'hat' | 'accessory'] === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setSelected(item)}
                  className="relative flex flex-col items-center gap-1 rounded-2xl p-3 shadow-md transition-transform hover:scale-105"
                  style={{
                    background: 'var(--color-surface)',
                    outline: on ? '2px solid var(--color-primary)' : 'none',
                    opacity: has || stamps >= item.price ? 1 : 0.55,
                  }}
                >
                  <span className="text-3xl">{item.emoji}</span>
                  <span className="text-[10px] font-bold" style={{ color: 'var(--color-text-main)' }}>{item.label}</span>
                  {has ? (
                    <span className="text-[9px] font-bold" style={{ color: on ? 'var(--color-primary)' : 'var(--color-text-sub)' }}>
                      {on ? '착용 중' : item.category === 'stamp' ? '보유' : '가지고 있어요'}
                    </span>
                  ) : (
                    <span className="text-[9px]" style={{ color: 'var(--color-text-sub)' }}>
                      {item.price === 0 ? '무료' : `🏅 ${item.price}`}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {msg && (
        <div
          className="fixed left-1/2 -translate-x-1/2 bottom-24 z-50 rounded-full px-4 py-2 text-[12px] font-bold text-white"
          style={{ background: 'rgba(20,20,25,0.9)' }}
        >
          {msg}
        </div>
      )}

      {/* 상세 / 구매 */}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-6"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={() => setSelected(null)}
        >
          <div
            className="w-full max-w-[320px] rounded-3xl p-6 text-center"
            style={{ background: 'var(--color-surface)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-6xl mb-3">{selected.emoji}</div>
            <div className="font-bold mb-1" style={{ color: 'var(--color-text-main)' }}>{selected.label}</div>
            <div className="text-xs mb-4" style={{ color: 'var(--color-text-sub)' }}>
              {selected.price === 0 ? '무료' : `🏅 도장 ${selected.price}개`}
            </div>

            {owned.has(selected.id) ? (
              selected.category === 'stamp' ? (
                <div className="rounded-xl p-3 text-xs mb-4" style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-sub)' }}>
                  숙제 검사할 때 이 도장을 찍어줄 수 있어요 💮
                </div>
              ) : (
                <button
                  onClick={() => equip(selected, equipped[selected.category as 'hat' | 'accessory'] !== selected.id)}
                  disabled={busy}
                  className="w-full rounded-full py-2.5 mb-2 text-sm font-bold text-white disabled:opacity-40"
                  style={{
                    background: equipped[selected.category as 'hat' | 'accessory'] === selected.id
                      ? 'var(--color-text-sub)'
                      : 'var(--color-primary)',
                  }}
                >
                  {equipped[selected.category as 'hat' | 'accessory'] === selected.id ? '빼기' : '착용하기'}
                </button>
              )
            ) : stamps >= selected.price ? (
              <button
                onClick={() => buy(selected)}
                disabled={busy}
                className="w-full rounded-full py-2.5 mb-2 text-sm font-bold text-white disabled:opacity-40"
                style={{ background: 'var(--color-primary)' }}
              >
                {busy ? '가져오는 중...' : selected.price === 0 ? '받기' : '사기'}
              </button>
            ) : (
              <div className="rounded-xl p-3 text-xs mb-4" style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-sub)' }}>
                도장이 {selected.price - stamps}개 모자라요. 숙제를 내고 검사를 받아보세요 📝
              </div>
            )}

            <button
              onClick={() => setSelected(null)}
              className="w-full rounded-full py-2.5 text-sm font-bold"
              style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-sub)' }}
            >
              닫기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
