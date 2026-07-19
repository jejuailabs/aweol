import { UserRole } from './firestore-schema';

export function canManageClass(role: UserRole | null): boolean {
  return role === 'super_admin' || role === 'teacher';
}

export function canUploadArtwork(role: UserRole | null): boolean {
  return role === 'student' || role === 'parent';
}

export function canApproveArtwork(role: UserRole | null): boolean {
  return role === 'super_admin' || role === 'teacher';
}

export function canWriteComment(role: UserRole | null): boolean {
  return role !== null;
}

export function canAccessAdmin(role: UserRole | null): boolean {
  return role === 'super_admin' || role === 'teacher';
}
