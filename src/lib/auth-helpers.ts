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
  return role === 'super_admin' || role === 'school_admin' || role === 'teacher';
}

/**
 * **반을 새로 만들 수 있는가** — 학교관리자와 총관리자만.
 *
 * 일반 교사에게 열어두면 담임 한 명이 3-4 반을 임의로 만들어 실제 학교와 어긋난다.
 * 학년·반 구성은 학교가 정하는 것이다.
 * 반이 없어서 못 들어가는 선생님은 **학교관리자에게 요청**하면 된다.
 */
export function canCreateClass(role: UserRole | null): boolean {
  return role === 'super_admin' || role === 'school_admin';
}

/**
 * 교직원인가 (선생님·학교관리자·총관리자).
 *
 * 화면 곳곳에 `role === 'teacher' || role === 'super_admin'` 이 흩어져 있었다.
 * 등급이 하나 늘 때마다 그걸 전부 찾아 고쳐야 하고, 하나 빠뜨리면
 * **어떤 화면에서는 교직원이고 어떤 화면에서는 아닌** 상태가 된다.
 * 그래서 한 군데로 모은다. `canManageClass` 와 같은 판정이지만 이름이 사실에 맞다.
 */
export function isStaff(role: UserRole | null): boolean {
  return role === 'super_admin' || role === 'school_admin' || role === 'teacher';
}

/** 학교 단위 관리자인가 (그 학교의 중간관리자 또는 총관리자) */
export function isSchoolManager(role: UserRole | null): boolean {
  return role === 'super_admin' || role === 'school_admin';
}

/**
 * 교사 신청을 승인할 수 있는가.
 *
 * 예전에는 총관리자 한 사람에게 전부 몰렸다. "이 사람이 우리 학교 선생님이 맞는가" 는
 * 그 학교가 제일 잘 알고, 학교가 늘면 총관리자가 감당할 수 없다.
 * 학교관리자는 **자기 학교 신청만** 볼 수 있다(서버가 학교로 거른다).
 */
export function canApproveTeacher(role: UserRole | null): boolean {
  return role === 'super_admin' || role === 'school_admin';
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
  // 학교관리자도 **맡은 반 안에서만** 담임과 같다. 학교 관리자라고 남의 반 숙제를
  // 고칠 수 있으면 안 된다 — 학교 단위 권한과 반 단위 권한은 다른 것이다.
  return (role === 'teacher' || role === 'school_admin')
    && (classIds ?? []).includes(classId);
}

export function canUploadArtwork(role: UserRole | null): boolean {
  // 교사는 아이들 작품 사진을 촬영해 직접 올린다
  return role === 'student' || role === 'parent' || role === 'teacher'
    || role === 'school_admin' || role === 'super_admin';
}

export function canApproveArtwork(role: UserRole | null): boolean {
  return role === 'super_admin' || role === 'school_admin' || role === 'teacher';
}

export function canWriteComment(role: UserRole | null): boolean {
  return role !== null;
}

export function canAccessAdmin(role: UserRole | null): boolean {
  return role === 'super_admin' || role === 'school_admin' || role === 'teacher';
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
  childClassIds?: string[];
} | null | undefined): string[] {
  if (!userDoc) return [];
  const fromChildren = (userDoc.children ?? []).map((c) => c.classId).filter(Boolean);
  // 규칙이 보는 평평한 목록. `children` 과 같은 내용이지만 옛 계정에는 한쪽만 있을 수 있다.
  const flatChildren = userDoc.childClassIds ?? [];
  const fromSelf = userDoc.classIds ?? [];
  return [...new Set([...fromSelf, ...fromChildren, ...flatChildren])];
}
