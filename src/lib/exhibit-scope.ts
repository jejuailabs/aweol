import type { ExhibitVisibility } from './firestore-schema';

/**
 * 전시실 공개 범위와, 작품에 베껴 두는 소속 정보.
 *
 * **한 군데서만 정한다.** 올릴 때·바꿀 때·거를 때가 각자 판단하면
 * "갤러리에서는 숨었는데 전시실에서는 보이는" 상태가 된다.
 */

/** 없으면 학교 공개. 이 기능 이전 전시실이 갑자기 숨으면 안 된다. */
export function visibilityOf(v: unknown): ExhibitVisibility {
  return v === 'class' ? 'class' : 'school';
}

export const VISIBILITY_LABEL: Record<ExhibitVisibility, string> = {
  school: '학교 전체가 봐요',
  class: '우리 반만 봐요',
};

/**
 * 작품이 걸린 자리. 경로에 이미 다 들어 있다 —
 * `schools/{schoolId}/classes/{classId}/activities/{activityId}/artworks[/{id}]`
 *
 * **읽기가 한 번도 안 든다.** 문자열을 자르는 게 전부다.
 */
export function scopeFromPath(path: string): {
  schoolId: string;
  classId: string;
  activityId: string;
} {
  const p = path.split('/');
  return { schoolId: p[1] ?? '', classId: p[3] ?? '', activityId: p[5] ?? '' };
}

/**
 * 이 작품을 갤러리에 걸어도 되는가 — **화면 쪽 판정.**
 *
 * 규칙(firestore.rules)도 같은 선을 본다. 여기만 고치고 규칙을 안 고치면
 * 화면에서만 숨는 것이고, 규칙만 고치면 조회가 통째로 실패한다(질의 조건이
 * 규칙보다 넓으면 Firestore 는 질의 전체를 거절한다).
 */
export function canSeeInGallery(
  art: { visibility?: unknown; classId?: string },
  viewer: { classIds: string[]; isStaff: boolean }
): boolean {
  if (visibilityOf(art.visibility) === 'school') return true;
  if (viewer.isStaff) return true;
  return !!art.classId && viewer.classIds.includes(art.classId);
}
