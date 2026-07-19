'use client';

import { useRef, useCallback, useEffect } from 'react';
import { setJoystickDir } from './walker';

export default function MobileJoystick() {
  const baseRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const activeTouch = useRef<number | null>(null);
  const center = useRef({ x: 0, y: 0 });
  const maxDist = 36;

  const handleMove = useCallback((clientX: number, clientY: number) => {
    if (!knobRef.current) return;
    let dx = clientX - center.current.x;
    let dy = clientY - center.current.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > maxDist) {
      dx = (dx / dist) * maxDist;
      dy = (dy / dist) * maxDist;
    }
    knobRef.current.style.transform = `translate(${dx}px, ${dy}px)`;
    setJoystickDir(dx / maxDist, dy / maxDist);
  }, []);

  const handleEnd = useCallback(() => {
    activeTouch.current = null;
    if (knobRef.current) knobRef.current.style.transform = 'translate(0px, 0px)';
    setJoystickDir(0, 0);
  }, []);

  useEffect(() => {
    const base = baseRef.current;
    if (!base) return;

    const onTouchStart = (e: TouchEvent) => {
      if (activeTouch.current !== null) return;
      const touch = e.changedTouches[0];
      activeTouch.current = touch.identifier;
      const rect = base.getBoundingClientRect();
      center.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      handleMove(touch.clientX, touch.clientY);
      e.preventDefault();
    };

    const onTouchMove = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === activeTouch.current) {
          handleMove(e.changedTouches[i].clientX, e.changedTouches[i].clientY);
          e.preventDefault();
          return;
        }
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === activeTouch.current) {
          handleEnd();
          return;
        }
      }
    };

    base.addEventListener('touchstart', onTouchStart, { passive: false });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd);
    window.addEventListener('touchcancel', onTouchEnd);

    return () => {
      base.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [handleMove, handleEnd]);

  return (
    <div
      ref={baseRef}
      className="absolute bottom-20 left-6 z-40 w-[88px] h-[88px] rounded-full flex items-center justify-center"
      style={{
        background: 'rgba(255,255,255,0.2)',
        border: '2px solid rgba(255,255,255,0.35)',
        backdropFilter: 'blur(4px)',
        touchAction: 'none',
      }}
    >
      <div
        ref={knobRef}
        className="w-10 h-10 rounded-full"
        style={{
          background: 'rgba(255,255,255,0.65)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          transition: 'transform 0.05s ease-out',
        }}
      />
    </div>
  );
}
