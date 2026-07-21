// `import type` 여야 한다 — 값이 아니라 타입만 쓴다.
// 값으로 들여오면 검증 스크립트(node --experimental-strip-types)가
// 없는 파일을 찾다가 터진다.
import type { UserRole } from './firestore-schema';

/**
 * 교직원인가 — **어느 반인지는 안 본다.**
 *
 * 이걸로 반 안의 쓰기 버튼을 열면 안 된다. 규칙(`isTeacherOf`)은 담당 반만
 * 허용하므로, 남의 반에서 버튼이 보이다가 눌렀을 때 거부당한다.
 * 반 안에서는 아래 `isTeacherOfClass` 를 쓸 것.
 */
export function canManageClass(role: UserRole | null): boolean {
  return role === 'super_admin' || role === 'teacher';
}

/**
 * **이 반**의 담임인가. 화면이 규칙(`isTeacherOf`)과 같은 조건을 봐야 한다.
 *
 * 숙제·퀴즈·틀린그림·알림장을 남의 반에 낼 수는 없다. 실제로 네 화면 모두
 * '선생님이면' 열려 있어서, 담당이 아닌 반에서 버튼을 누르면 아무 설명 없이
 * 실패했다.
 */
export function isTeacherOfClass(
  role: UserRole | null,
  classIds: string[] | undefined,
  classId: string
): boolean {
  if (role === 'super_admin') return true;
  return role === 'teacher' && (classIds ?? []).includes(classId);
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

/**
 * '내 반' 이 어디인가 — 아이는 자기 반, 선생님은 맡은 반, 학부모는 **자녀의 반**.
 *
 * 학부모만 `classIds` 가 아니라 `children` 에 들어 있어서, 화면마다 따로 풀면
 * 한 곳은 되고 한 곳은 안 되는 일이 생긴다. 그래서 여기 한 군데서만 정한다.
 * 총관리자는 비운다 — 온 학교가 '내 반' 이면 강조가 강조가 아니게 된다.
 */
export function myClassIds(userDoc: {
  role?: UserRole | null;
  classIds?: string[];
  children?: { classId: string }[];
} | null | undefined): string[] {
  if (!userDoc) return [];
  const fromChildren = (userDoc.children ?? []).map((c) => c.classId).filter(Boolean);
  const fromSelf = userDoc.classIds ?? [];
  return [...new Set([...fromSelf, ...fromChildren])];
}
