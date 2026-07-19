import { UserRole } from './firestore-schema';

export function canManageClass(role: UserRole | null): boolean {
  return role === 'super_admin' || role === 'teacher';
}

export function canUploadArtwork(role: UserRole | null): boolean {
  // 교사는 아이들 작품 사진을 촬영해 직접 올린다
  return role === 'student' || role === 'parent' || role === 'teacher' || role === 'super_admin';
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
