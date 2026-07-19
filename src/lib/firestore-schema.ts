import { Timestamp } from 'firebase/firestore';

export type UserRole = 'super_admin' | 'teacher' | 'student' | 'parent';

export interface UserDoc {
  displayName: string;
  photoURL: string;
  role: UserRole | null;
  classIds: string[];
  children: { studentUid: string; classId: string; name: string }[];
  pendingClassRequest: string | null;
  avatarId: string | null;
  avatarCustom: { hat: string | null; accessory: string | null };
  preferences: { theme: 'light' | 'dark' };
  createdAt: Timestamp;
}

export interface SchoolDoc {
  name: string;
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
