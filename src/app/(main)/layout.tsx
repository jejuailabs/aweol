'use client';

import { usePathname } from 'next/navigation';
import BottomNav from '@/components/navigation/BottomNav';
import RoleSwitcher from '@/components/navigation/RoleSwitcher';
import { useAuth } from '@/lib/auth-context';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const isExhibitRoom = pathname?.includes('/activity/') || pathname?.endsWith('/room');

  // 풀스크린 3D 화면이거나 비로그인 관람객에게는 하단 메뉴를 보여주지 않는다
  // (역할 테스트 버튼은 슈퍼 관리자에게 어디서나 필요하므로 항상 렌더한다)
  if (isExhibitRoom || !user) {
    return (
      <>
        {children}
        <RoleSwitcher />
      </>
    );
  }

  return (
    <div className="relative mx-auto w-full min-h-screen pb-20">
      {children}
      <BottomNav />
      <RoleSwitcher />
    </div>
  );
}
