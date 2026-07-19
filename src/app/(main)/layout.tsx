'use client';

import { usePathname } from 'next/navigation';
import BottomNav from '@/components/navigation/BottomNav';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isExhibitRoom = pathname?.includes('/activity/');

  if (isExhibitRoom) {
    return <>{children}</>;
  }

  return (
    <div className="relative mx-auto w-full min-h-screen pb-20">
      {children}
      <BottomNav />
    </div>
  );
}
