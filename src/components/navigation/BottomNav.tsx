'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { canAccessAdmin } from '@/lib/auth-helpers';

const baseItems = [
  { href: '/', label: '지도', icon: '🗺️' },
  { href: '/gallery', label: '갤러리', icon: '🖼️' },
  { href: '/my-stand', label: '내 스탠드', icon: '⭐' },
  { href: '/shop', label: '상점', icon: '🛒' },
  { href: '/settings', label: '설정', icon: '⚙️' },
];

export default function BottomNav() {
  const pathname = usePathname();
  const { role, actualRole, userDoc } = useAuth();

  // 관리는 학교 단위다. 보고 있는 학교가 있으면 그 학교로,
  // 없으면 총관리자는 학교 목록으로 / 교사는 자기 학교로 보낸다.
  // (예전에는 학교 밖에서 누르면 지도로 튕겨서 관리 화면에 갈 방법이 없었다)
  const schoolId = pathname?.match(/^\/(?:school|admin)\/([^/]+)/)?.[1];
  const mySchool = userDoc?.schoolIds?.[0];
  const adminHref = schoolId
    ? `/admin/${schoolId}`
    : actualRole === 'super_admin'
      ? '/admin'
      : mySchool
        ? `/admin/${mySchool}`
        : '/admin';

  const navItems = canAccessAdmin(role)
    ? [...baseItems.slice(0, 2), { href: adminHref, label: '관리', icon: '📊' }, ...baseItems.slice(2)]
    : baseItems;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50">
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
