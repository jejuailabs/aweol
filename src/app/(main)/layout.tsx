'use client';

import { RouteGuard } from '@/lib/route-guard';
import BottomNav from '@/components/navigation/BottomNav';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <RouteGuard>
      <div className="relative mx-auto w-full max-w-[480px] min-h-screen pb-20">
        {children}
        <BottomNav />
      </div>
    </RouteGuard>
  );
}
