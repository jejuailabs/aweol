'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { href: '/school', label: '학교', icon: '🏫' },
  { href: '/gallery', label: '갤러리', icon: '🖼️' },
  { href: '/my-stand', label: '내 스탠드', icon: '⭐' },
  { href: '/shop', label: '상점', icon: '🛒' },
  { href: '/settings', label: '설정', icon: '⚙️' },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 z-50 w-full max-w-[480px]">
      <div
        className="flex items-center justify-around rounded-t-2xl px-2 py-2"
        style={{ background: 'var(--color-navbar-bg)', backdropFilter: 'blur(12px)' }}
      >
        {navItems.map((item) => {
          const isActive = pathname?.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-col items-center gap-0.5 px-3 py-1 transition-transform"
              style={{ transform: isActive ? 'scale(1.15)' : 'scale(1)' }}
            >
              <span className="text-xl">{item.icon}</span>
              <span
                className="text-[10px] font-medium"
                style={{ color: isActive ? 'var(--color-primary)' : '#9CA3AF' }}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
