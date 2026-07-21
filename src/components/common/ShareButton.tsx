'use client';

import { useState, useCallback, useEffect } from 'react';

/**
 * 퍼가기 버튼.
 *
 * 모바일에서는 OS 공유 시트를 띄운다 — 카카오톡·문자·인스타가 거기 다 들어 있어서
 * 우리가 SNS 별로 붙이는 것보다 낫고, 카카오 SDK 앱키를 심을 필요도 없다.
 * 공유 시트가 없는 데스크톱에서만 링크 복사와 X·페이스북을 직접 보여준다.
 */
export default function ShareButton({
  title,
  text,
  /** 없으면 현재 주소 */
  url,
  variant = 'floating',
}: {
  title: string;
  text?: string;
  url?: string;
  variant?: 'floating' | 'inline';
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [href, setHref] = useState('');

  // 서버 렌더 시점에는 window 가 없다
  useEffect(() => {
    setHref(url || (typeof window !== 'undefined' ? window.location.href : ''));
  }, [url]);

  const share = useCallback(async () => {
    const shareUrl = url || window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title, text: text || title, url: shareUrl });
        return;
      } catch {
        // 사용자가 취소한 경우도 여기로 온다 — 조용히 넘어간다
        return;
      }
    }
    setOpen(true);
  }, [title, text, url]);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }, [href]);

  const enc = encodeURIComponent;

  return (
    <>
      <button
        onClick={share}
        aria-label="퍼가기"
        className={
          variant === 'floating'
            ? 'ac-btn shrink-0 px-3 py-2 text-sm font-bold'
            : 'rounded-full px-3 py-1.5 text-[13px] font-bold'
        }
        style={{
          background: 'rgba(255,255,255,0.9)',
          color: '#6B5B43',
          border: '2px solid rgba(255,255,255,0.7)',
          boxShadow: '0 3px 0 rgba(0,0,0,0.08)',
        }}
      >
        🔗 퍼가기
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center px-6"
          style={{ background: 'rgba(24,20,16,0.5)' }}
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-[340px] rounded-3xl p-5"
            style={{ background: '#FFFAF0' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-sm font-black mb-1" style={{ color: '#3A3226' }}>🔗 퍼가기</div>
            <div className="text-[13px] mb-3 leading-relaxed" style={{ color: '#A89880' }}>
              {title}
            </div>

            <div
              className="rounded-xl px-3 py-2 mb-2 text-[13px] break-all"
              style={{ background: 'white', color: '#6B5B43' }}
            >
              {href}
            </div>

            <button
              onClick={copy}
              className="w-full rounded-xl py-2.5 mb-2 text-[15px] font-bold text-white"
              style={{ background: copied ? '#3BAF9F' : 'var(--color-primary)' }}
            >
              {copied ? '복사했어요!' : '링크 복사하기'}
            </button>

            <div className="flex gap-2 mb-2">
              <a
                href={`https://twitter.com/intent/tweet?text=${enc(title)}&url=${enc(href)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 rounded-xl py-2.5 text-center text-[14px] font-bold"
                style={{ background: '#111', color: 'white' }}
              >
                X
              </a>
              <a
                href={`https://www.facebook.com/sharer/sharer.php?u=${enc(href)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 rounded-xl py-2.5 text-center text-[14px] font-bold text-white"
                style={{ background: '#1877F2' }}
              >
                페이스북
              </a>
            </div>

            <button
              onClick={() => setOpen(false)}
              className="w-full rounded-xl py-2 text-[14px] font-bold"
              style={{ background: 'rgba(0,0,0,0.05)', color: '#8A7A5F' }}
            >
              닫기
            </button>
          </div>
        </div>
      )}
    </>
  );
}
