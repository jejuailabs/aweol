'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { canAccessAdmin } from '@/lib/auth-helpers';

interface NavItem { href: string; label: string; icon: string }

const baseItems: NavItem[] = [
  { href: '/', label: '지도', icon: '🗺️' },
  { href: '/village', label: '마을', icon: '🏘️' },
  { href: '/gallery', label: '갤러리', icon: '🖼️' },
  { href: '/my-stand', label: '내 스탠드', icon: '⭐' },
  { href: '/shop', label: '상점', icon: '🛒' },
  { href: '/settings', label: '설정', icon: '⚙️' },
];

/**
 * 휴대폰에서 한 줄에 들어가는 개수.
 *
 * 7개를 다 펴면 '갤러 / 리', '내 스 / 탠드' 처럼 **글자가 두 줄로 터지고**
 * 메뉴가 두꺼워져서 3D 화면의 조이스틱까지 덮는다.
 * 그래서 앞 4개만 두고 나머지는 '더보기' 로 접는다. 넓은 화면에선 다 편다.
 */
const MOBILE_SLOTS = 4;

export default function BottomNav() {
  const pathname = usePathname();
  const { role, actualRole, userDoc } = useAuth();
  const [more, setMore] = useState(false);

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

  const staff = canAccessAdmin(role);
  const navItems: NavItem[] = staff
    ? [...baseItems.slice(0, 2), { href: adminHref, label: '관리', icon: '📊' }, ...baseItems.slice(2)]
    : baseItems;

  /**
   * 접었을 때 무엇을 남길지는 **누가 쓰느냐**에 달렸다.
   * 선생님은 '관리' 가 매일 쓰는 곳이고, 아이는 '내 스탠드' 가 그렇다.
   */
  const primary = staff
    ? navItems.filter((i) => ['/', '/village', '/gallery'].includes(i.href) || i.href === adminHref)
    : navItems.filter((i) => ['/', '/village', '/gallery', '/my-stand'].includes(i.href));
  const mobileMain = primary.slice(0, MOBILE_SLOTS);
  const mobileRest = navItems.filter((i) => !mobileMain.includes(i));

  const isOn = (href: string) => (href === '/' ? pathname === '/' : pathname?.startsWith(href));

  const cell = (item: NavItem, onClick?: () => void) => (
    <Link
      key={item.href}
      href={item.href}
      onClick={onClick}
      className="flex flex-1 min-w-0 flex-col items-center gap-0.5 py-1 transition-transform"
      style={{ transform: isOn(item.href) ? 'scale(1.12)' : 'scale(1)' }}
    >
      <span className="text-xl leading-none">{item.icon}</span>
      {/* 줄바꿈 금지 — 이게 없으면 '내 스 / 탠드' 가 된다 */}
      <span
        className="text-[11px] font-medium whitespace-nowrap"
        style={{ color: isOn(item.href) ? 'var(--color-primary)' : '#9CA3AF' }}
      >
        {item.label}
      </span>
    </Link>
  );

  return (
    <>
      {/* 더보기 시트 — 메뉴 위로 올라온다 */}
      {more && (
        <div
          className="fixed inset-0 z-[49] sm:hidden"
          style={{ background: 'rgba(20,16,12,0.4)' }}
          onClick={() => setMore(false)}
        >
          <div
            className="absolute left-0 right-0 rounded-t-3xl px-3 pt-3 pb-3 pad-bottom-safe"
            style={{ bottom: 'var(--nav-h)', background: 'var(--color-navbar-bg)', backdropFilter: 'blur(12px)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex">
              {mobileRest.map((i) => cell(i, () => setMore(false)))}
            </div>
          </div>
        </div>
      )}

      <nav className="fixed bottom-0 left-0 right-0 z-50">
        <div
          className="flex items-center rounded-t-2xl px-1 py-1.5 pad-bottom-safe"
          style={{ background: 'var(--color-navbar-bg)', backdropFilter: 'blur(12px)', minHeight: 'var(--nav-h)' }}
        >
          {/* 휴대폰 — 4개 + 더보기 */}
          <div className="flex flex-1 min-w-0 sm:hidden">
            {mobileMain.map((i) => cell(i, () => setMore(false)))}
            <button
              onClick={() => setMore((v) => !v)}
              className="flex flex-1 min-w-0 flex-col items-center gap-0.5 py-1"
            >
              <span className="text-xl leading-none">{more ? '✕' : '☰'}</span>
              <span
                className="text-[11px] font-medium whitespace-nowrap"
                style={{ color: more ? 'var(--color-primary)' : '#9CA3AF' }}
              >
                더보기
              </span>
            </button>
          </div>

          {/* 넓은 화면 — 다 편다 */}
          <div className="hidden flex-1 sm:flex">
            {navItems.map((i) => cell(i))}
          </div>
        </div>
      </nav>
    </>
  );
}
