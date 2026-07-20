import { Timestamp } from 'firebase/firestore';

export type UserRole = 'super_admin' | 'teacher' | 'student' | 'parent';

export interface UserDoc {
  displayName: string;
  photoURL: string;
  /** 실제 권한. 서버(/api/role)만 정한다 — 클라이언트가 쓸 수 있으면 아무나 교사가 된다. */
  role: UserRole | null;
  /** 승인 대기 중인 신청 역할. 교사는 슈퍼관리자가 승인해야 role 로 올라간다. */
  pendingRole: UserRole | null;
  classIds: string[];
  children: { studentUid: string; classId: string; name: string }[];
  pendingClassRequest: string | null;
  avatarId: string | null;
  /** 착용 중인 상점 아이템 id. 서버(/api/shop)만 바꾼다 — 보유하지 않은 걸 낄 수 없어야 한다. */
  avatarCustom: { hat: string | null; accessory: string | null };
  /** 보유 도장 수. 서버만 바꾼다 — 클라이언트가 고칠 수 있으면 무한히 찍어낼 수 있다. */
  stamps: number;
  preferences: { theme: 'light' | 'dark' };
  createdAt: Timestamp;
}

/** 구매한 상점 아이템. 문서 ID = 아이템 id 라서 중복 구매가 구조적으로 막힌다. */
export interface InventoryItemDoc {
  itemId: string;
  category: 'hat' | 'accessory' | 'stamp';
  /** 살 때 실제로 낸 값 (나중에 가격이 바뀌어도 기록은 남는다) */
  paid: number;
  acquiredAt: Timestamp;
}

/** 도장 입출금 내역. "이 도장 어디서 받았지?" 에 답할 수 있어야 한다. */
export interface StampLedgerDoc {
  /** 양수는 지급, 음수는 사용 */
  amount: number;
  reason: string;
  /** 지급 근거가 된 숙제/아이템 */
  refId: string | null;
  byName: string;
  balanceAfter: number;
  createdAt: Timestamp;
}

export interface SchoolDoc {
  name: string;
  /** 지도에 마커를 찍을 좌표 */
  lat: number;
  lng: number;
  /** 학교 대표 이미지 (생성 또는 업로드 → Storage) */
  imageUrl: string;
  /** 지도 마커에 함께 보여줄 짧은 소개 */
  tagline: string;
  /** 개설할 학년 수와 학년당 반 수 (반 자동 생성에 쓴다) */
  gradeCount: number;
  classPerGrade: number;
  /** 3D 학교 외관에 반영할 선택 요소 (예: 'rainbow', 'playground') */
  assets: string[];
  createdBy: string;
  isArchived: boolean;
  createdAt: Timestamp;
}

export interface GradeDoc {
  label: string;
  order: number;
}

export interface ClassDoc {
  schoolId: string;
  grade: string;
  classNumber: number;
  year: string;
  teacherUid: string;
  teacherName: string;
  motto: string;
  introText: string;
  isArchived: boolean;
  memberUids: string[];
}

export interface ActivityDoc {
  title: string;
  date: Timestamp;
  description: string;
  thumbnailUrl: string;
  order: number;
}

export interface ArtworkDoc {
  title: string;
  artistName: string;
  artistUid: string;
  imageUrl: string;
  thumbnailUrl: string;
  type: 'flat' | 'sculpture';
  artistComment: string;
  uploadedBy: string;
  uploadedByRole: 'student' | 'parent' | 'teacher';
  uploadedAt: Timestamp;
  status: 'pending' | 'approved' | 'rejected';
  rejectionReason: string | null;
}

export interface CommentDoc {
  text: string;
  authorUid: string;
  authorName: string;
  authorRole: UserRole;
  createdAt: Timestamp;
}

export interface RosterUploadDoc {
  classId: string;
  uploadedBy: string;
  fileName: string;
  rowCount: number;
  uploadedAt: Timestamp;
}

export type NoticeKind = 'notice' | 'meal' | 'homework' | 'quiz';

/** 학급 명부의 한 줄. 학생코드로 실제 계정(uid)과 연결된다. */
export interface StudentRosterDoc {
  number: number;
  name: string;
  /** 학생이 가입 없이 입장할 때 쓰는 코드 (교사가 발급) */
  code: string | null;
  /** 코드를 사용해 연결된 학생 계정 */
  linkedUid: string | null;
  linkedAt: Timestamp | null;
}

/**
 * 코드 → 학생 역인덱스. 클라이언트는 절대 읽지 못하고 서버만 조회한다.
 * (읽기가 열리면 코드를 긁어 남의 반에 들어갈 수 있다)
 */
export interface StudentCodeDoc {
  classId: string;
  studentDocId: string;
  number: number;
  name: string;
  createdAt: Timestamp;
}

export type SubmitType = 'text' | 'drawing' | 'image';
/** class: 아이들과 함께 보기 / teacher: 선생님만 보기 */
export type HomeworkVisibility = 'class' | 'teacher';

export interface HomeworkDoc {
  title: string;
  description: string;
  submitType: SubmitType;
  visibility: HomeworkVisibility;
  dueDate: string | null;
  authorUid: string;
  authorName: string;
  createdAt: Timestamp;
}

/** 제출물. 문서 ID = 학생 uid 라서 한 명당 하나만 유지된다. */
export interface SubmissionDoc {
  studentUid: string;
  studentName: string;
  type: SubmitType;
  text: string;
  imageUrl: string;
  /** approved: 공개 가능 / held: AI가 걸러 선생님 확인 대기 */
  status: 'approved' | 'held';
  /** AI 1차 검수 결과 (거부가 아니라 보류 판단 근거) */
  moderation: { flagged: boolean; reason: string } | null;
  /** 규칙에서 단일 조건으로 판정하려고 서버가 계산해 넣는 값 */
  publicToClass: boolean;
  teacherComment: string;
  /** 선생님이 실제로 들여다보고 검사를 끝냈는지. 그리드의 3번째 색이 이 값이다. */
  checked: boolean;
  checkedAt: Timestamp | null;
  /** 선생님이 찍어준 도장 도안 (상점의 stamp 카테고리 id) */
  stamp: { itemId: string; emoji: string; label: string } | null;
  /** 도장을 이미 지급했는지. 재검사해도 두 번 주지 않는다. */
  awarded: boolean;
  submittedAt: Timestamp;
}

/**
 * 콕 찌르기. 미제출 학생에게 선생님이 보내는 가벼운 알림.
 * 문서 ID = 학생 uid 라서 한 명당 하나만 유지되고, 여러 번 찌르면 count 만 올라간다.
 * (반려 기능을 넣지 않기로 한 대신, 오프라인 수업과 섞여도 안전한 이 방식만 쓴다)
 */
export interface HomeworkNudgeDoc {
  studentUid: string;
  studentName: string;
  count: number;
  byName: string;
  lastAt: Timestamp;
}

/** 교실 알림판 글 (알림장·급식·숙제·퀴즈). 작성은 교직원만. */
export interface NoticeDoc {
  kind: NoticeKind;
  title: string;
  body: string;
  /** 급식·알림장처럼 날짜가 의미 있는 글용 (YYYY-MM-DD) */
  forDate: string | null;
  authorUid: string;
  authorName: string;
  createdAt: Timestamp;
}

/** 칠판 낙서 한 획(또는 텍스트 한 개). 작성자는 항상 기록되며 익명 작성은 불가. */
export interface BlackboardItemDoc {
  kind: 'stroke' | 'text';
  /** 정규화 좌표(0~1)를 [x,y,x,y,...] 로 편 배열. Firestore가 중첩 배열을 못 쓴다. */
  points: number[];
  color: string;
  width: number;
  /** kind === 'text' 일 때만 */
  text?: string;
  authorUid: string;
  authorName: string;
  authorRole: UserRole;
  createdAt: Timestamp;
}

/** 계정 도용 추적용 접근 기록. 슈퍼 관리자만 조회 가능. */
export interface AccessLogDoc {
  uid: string;
  displayName: string;
  role: UserRole | null;
  action: string;
  classId: string | null;
  ip: string;
  userAgent: string;
  createdAt: Timestamp;
}

export type AvatarId =
  | 'avatar_01'
  | 'avatar_02'
  | 'avatar_03'
  | 'avatar_04'
  | 'avatar_05'
  | 'avatar_06'
  | 'avatar_07'
  | 'avatar_08';
