'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from './auth-context';
import { UserRole } from './firestore-schema';

interface RouteGuardProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
  requireAuth?: boolean;
}

export function RouteGuard({ children, allowedRoles, requireAuth = false }: RouteGuardProps) {
  const { user, role, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    if (requireAuth && !user) {
      router.replace('/login');
      return;
    }

    if (requireAuth && user && !role) {
      router.replace('/join-request');
      return;
    }

    if (allowedRoles && role && !allowedRoles.includes(role)) {
      router.replace('/school');
    }
  }, [user, role, loading, requireAuth, allowedRoles, router]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#3EC46D] border-t-transparent" />
      </div>
    );
  }

  if (requireAuth && !user) return null;
  if (allowedRoles && role && !allowedRoles.includes(role)) return null;

  return <>{children}</>;
}
