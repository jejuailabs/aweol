'use client';

import { useState } from 'react';

interface MascotProps {
  message: string;
  onDismiss?: () => void;
}

export default function Mascot({ message, onDismiss }: MascotProps) {
  const [visible, setVisible] = useState(true);

  if (!visible) return null;

  return (
    <div /* 하단 메뉴 위에 앉는다. bottom-20 은 메뉴에 깔린다. */
    className="pos-above-nav fixed left-4 z-40 flex items-end gap-2 max-w-[280px]">
      <div className="w-14 h-14 rounded-full bg-[var(--color-primary)] flex items-center justify-center text-2xl shadow-lg">
        🐾
      </div>
      <div
        className="relative rounded-2xl px-4 py-3 text-sm font-medium text-white shadow-lg"
        style={{ background: 'var(--color-speech-bubble)' }}
      >
        <div className="absolute -left-2 bottom-3 w-0 h-0 border-t-8 border-r-8 border-t-transparent" style={{ borderRightColor: 'var(--color-speech-bubble)' }} />
        {message}
        {onDismiss && (
          <button
            onClick={() => { setVisible(false); onDismiss(); }}
            className="ml-2 text-white/70 hover:text-white"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
