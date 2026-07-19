'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth-context';

interface ShopItem {
  id: string;
  emoji: string;
  label: string;
  price: number;
  category: 'hat' | 'accessory';
}

const SHOP_ITEMS: ShopItem[] = [
  { id: 'hat-beret', emoji: '🎩', label: '베레모', price: 3, category: 'hat' },
  { id: 'hat-crown', emoji: '👑', label: '왕관', price: 10, category: 'hat' },
  { id: 'hat-cap', emoji: '🧢', label: '야구모자', price: 2, category: 'hat' },
  { id: 'hat-ribbon', emoji: '🎀', label: '리본', price: 2, category: 'hat' },
  { id: 'acc-glasses', emoji: '👓', label: '안경', price: 3, category: 'accessory' },
  { id: 'acc-brush', emoji: '🖌️', label: '요술 붓', price: 5, category: 'accessory' },
  { id: 'acc-balloon', emoji: '🎈', label: '풍선', price: 2, category: 'accessory' },
  { id: 'acc-star', emoji: '🌟', label: '반짝별', price: 8, category: 'accessory' },
];

export default function ShopPage() {
  const { user } = useAuth();
  const [selectedItem, setSelectedItem] = useState<ShopItem | null>(null);

  return (
    <div className="px-4 pt-8 pb-24 mx-auto max-w-[960px]">
      <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--color-text-main)' }}>🛒 꾸미기 상점</h1>
      <p className="text-xs mb-5" style={{ color: 'var(--color-text-sub)' }}>
        도장을 모아서 아바타를 꾸며보세요! (도장은 작품 활동으로 얻을 수 있어요)
      </p>

      {/* 보유 도장 */}
      <div
        className="rounded-2xl p-4 mb-6 flex items-center justify-between shadow-md"
        style={{ background: 'linear-gradient(135deg, var(--color-accent-yellow) 0%, #FFE29A 100%)' }}
      >
        <span className="text-sm font-bold" style={{ color: '#7A5C00' }}>내 도장</span>
        <span className="text-lg font-bold" style={{ color: '#7A5C00' }}>
          🏅 {user ? '0개' : '로그인 필요'}
        </span>
      </div>

      {/* 모자 */}
      <h2 className="text-sm font-bold mb-3" style={{ color: 'var(--color-text-main)' }}>🎩 모자</h2>
      <div className="grid grid-cols-4 gap-3 mb-6">
        {SHOP_ITEMS.filter((i) => i.category === 'hat').map((item) => (
          <button
            key={item.id}
            onClick={() => setSelectedItem(item)}
            className="flex flex-col items-center gap-1 rounded-2xl p-3 shadow-md transition-transform hover:scale-105"
            style={{ background: 'var(--color-surface)' }}
          >
            <span className="text-3xl">{item.emoji}</span>
            <span className="text-[10px] font-bold" style={{ color: 'var(--color-text-main)' }}>{item.label}</span>
            <span className="text-[9px]" style={{ color: 'var(--color-text-sub)' }}>🏅 {item.price}</span>
          </button>
        ))}
      </div>

      {/* 액세서리 */}
      <h2 className="text-sm font-bold mb-3" style={{ color: 'var(--color-text-main)' }}>✨ 액세서리</h2>
      <div className="grid grid-cols-4 gap-3">
        {SHOP_ITEMS.filter((i) => i.category === 'accessory').map((item) => (
          <button
            key={item.id}
            onClick={() => setSelectedItem(item)}
            className="flex flex-col items-center gap-1 rounded-2xl p-3 shadow-md transition-transform hover:scale-105"
            style={{ background: 'var(--color-surface)' }}
          >
            <span className="text-3xl">{item.emoji}</span>
            <span className="text-[10px] font-bold" style={{ color: 'var(--color-text-main)' }}>{item.label}</span>
            <span className="text-[9px]" style={{ color: 'var(--color-text-sub)' }}>🏅 {item.price}</span>
          </button>
        ))}
      </div>

      {/* 구매 모달 */}
      {selectedItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-6"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={() => setSelectedItem(null)}
        >
          <div
            className="w-full max-w-[320px] rounded-3xl p-6 text-center"
            style={{ background: 'var(--color-surface)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-6xl mb-3">{selectedItem.emoji}</div>
            <div className="font-bold mb-1" style={{ color: 'var(--color-text-main)' }}>{selectedItem.label}</div>
            <div className="text-xs mb-4" style={{ color: 'var(--color-text-sub)' }}>🏅 도장 {selectedItem.price}개</div>
            <div
              className="rounded-xl p-3 text-xs mb-4"
              style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-sub)' }}
            >
              도장이 부족해요! 작품을 올리고 도장을 모아보세요 🎨
            </div>
            <button
              onClick={() => setSelectedItem(null)}
              className="w-full rounded-full py-2.5 text-sm font-bold text-white"
              style={{ background: 'var(--color-primary)' }}
            >
              확인
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
