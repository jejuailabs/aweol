import { Timestamp } from 'firebase/firestore';

export type UserRole = 'super_admin' | 'teacher' | 'student' | 'parent';

export interface UserDoc {
  displayName: string;
  photoURL: string;
  /** 실제 권한. 서버(/api/role)만 정한다 — 클라이언트가 쓸 수 있으면 아무나 교사가 된다. */
  role: UserRole | null;
  /** 승인 대기 중인 신청 역할. 교사는 슈퍼관리자가 승인해야 role 로 올라간다. */
  pendingRole: UserRole | null;
  /** 교사 신청 시 고른 학교. 승인되면 schoolIds 로 옮겨간다. */
  pendingSchoolId: string | null;
  /** 교사 신청 시 적은 담당 반(예: '3-2'). 승인되면 classIds 로 옮겨간다. */
  pendingClassId: string | null;
  /**
   * 교사가 소속된 학교. **교사 권한은 이 목록 안에서만 통한다.**
   * 슈퍼관리자는 비어 있어도 전체를 넘나든다.
   */
  schoolIds: string[];
  /**
   * 소속 반. 학생·학부모에게는 '내 반', 교사에게는 **'내가 맡은 반'** 이다.
   * 교사도 이 목록 밖의 반은 남의 반이라 손대지 못한다.
   */
  classIds: string[];
  children: { studentUid: string; classId: string; name: string }[];
  pendingClassRequest: string | null;
  avatarId: string | null;
  /** 착용 중인 상점 아이템 id. 서버(/api/shop)만 바꾼다 — 보유하지 않은 걸 낄 수 없어야 한다. */
  avatarCustom: { hat: string | null; accessory: string | null };
  /** 옷·머리 색 (프리셋 위에 덧입힌다). 사고파는 게 아니라 본인이 고른다. */
  avatarTint?: { shirt: string | null; hair: string | null };
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

/**
 * 학교의 상징.
 *
 * `founded` 처럼 웹에서 확인되는 것과, `flower`/`tree`/`motto` 처럼
 * **학교 홈페이지에만 있어서 AI가 못 찾는 것**이 섞여 있다.
 * 후자는 학교가 직접 적는다 — 못 찾은 걸 그럴듯하게 지어내면
 * 남의 학교 정보를 틀리게 박아두는 셈이다.
 */
export interface SchoolProfile {
  /** 개교 연도 (예: '1923') */
  founded: string;
  /** 교훈 */
  motto: string;
  /** 교화 — 상징 꽃 */
  flower: string;
  /** 교목 — 상징 나무 */
  tree: string;
  /** 학교 특징 한두 줄 */
  note: string;
  /** AI가 참고한 주소. 사람이 눌러서 맞는지 확인하라고 남긴다 */
  sources: string[];
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
  /** 현관 위 동그란 자리에 거는 교표 (Storage). 없으면 시계가 그대로 보인다 */
  emblemUrl?: string;
  /** 학교 소개 — AI 조사 결과와 학교가 직접 적은 것이 섞여 있다 */
  profile?: SchoolProfile;
  createdBy: string;
  isArchived: boolean;
  createdAt: Timestamp;
}

/** 학교 현관에 붙는 공지 — 반 알림장과 달리 학교 전체가 본다 */
export interface HallNoticeDoc {
  title: string;
  body: string;
  authorUid: string;
  authorName: string;
  createdAt: Timestamp;
}

/**
 * 건의함.
 *
 * **공개가 아니다.** 낸 사람과 그 학교 교직원만 본다.
 * 전교생이 다 보는 게시판이면 아이가 하고 싶은 말을 못 쓴다.
 */
export interface SuggestionDoc {
  body: string;
  authorUid: string;
  authorName: string;
  /** 선생님 답변. 아직 없으면 null */
  reply: string | null;
  repliedBy: string | null;
  createdAt: Timestamp;
}

export type PetKind = 'dog' | 'cat' | 'rabbit';

/**
 * 학교에서 함께 키우는 동물. 학교당 한 마리 (schools 아래 pet/main).
 *
 * **배고픔·목마름을 따로 저장하지 않는다.** 마지막으로 먹인 시각만 두고,
 * 화면에서 '지금으로부터 몇 시간 지났나'로 계산한다.
 * 수치를 저장하면 시간마다 깎아줄 서버가 필요한데, 그건 학교 수만큼 도는 배치다.
 * 시각 하나면 아무도 안 볼 때도 알아서 배가 고파진다.
 */
export interface SchoolPetDoc {
  kind: PetKind;
  name: string;
  /** 마지막으로 먹이를 준 시각 */
  fedAt: Timestamp;
  /** 마지막으로 물을 준 시각 */
  wateredAt: Timestamp;
  /** 마지막으로 쓰다듬은 시각 */
  pettedAt: Timestamp;
  /** 누적 횟수 — 아이들이 얼마나 돌봤는지 보여주려고 센다 */
  careCount: number;
  /** 마지막으로 돌본 사람 이름 */
  lastCarerName: string;
}

export interface GradeDoc {
  label: string;
  order: number;
}

export type NoticeKind = 'notice' | 'meal' | 'homework' | 'quiz' | 'spot';

export interface ClassDoc {
  schoolId: string;
  grade: string;
  classNumber: number;
  year: string;
  teacherUid: string;
  teacherName: string;
  motto: string;
  introText: string;
  /**
   * 알림판에 걸 칸. 없거나 비어 있으면 전부 보여준다(기존 반 호환).
   * 안 쓰는 칸까지 걸어두면 아이들이 빈 칸을 눌러보고 실망한다.
   */
  noticeTabs?: NoticeKind[];
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

/**
 * 숙제를 어떤 모양으로 내는가.
 *
 * 선생님이 하나를 고르면 아이 화면에는 **그 입력창 하나만** 나온다.
 * 여러 개를 열어두면 아이가 뭘로 내야 하는지부터 헷갈린다.
 *
 * `video` 와 `link` 는 둘 다 영상이지만 값이 다르다:
 * - `link` 는 유튜브 주소를 받는다. 저장도 트래픽도 0이다.
 * - `video` 는 파일을 받는다. 30초짜리도 한 반이면 450MB 라서 용량 상한을 건다.
 *   (무료 5GB 기준 숙제 11개면 꽉 찬다 — 실측 계산)
 */
export type SubmitType = 'text' | 'drawing' | 'image' | 'video' | 'link';
/** class: 아이들과 함께 보기 / teacher: 선생님만 보기 */
export type HomeworkVisibility = 'class' | 'teacher';

export interface HomeworkDoc {
  title: string;
  description: string;
  submitType: SubmitType;
  visibility: HomeworkVisibility;
  /** 마감일 'YYYY-MM-DD'. 없으면 기한 없는 숙제 */
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
  /** 올린 영상 파일 (Storage) */
  videoUrl: string;
  /** 붙여넣은 영상 주소 (유튜브 등). 저장 용량을 안 쓰는 쪽 */
  linkUrl: string;
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

// ---------- 퀴즈 ----------

/** choice: 객관식 / short: 단답형 주관식 / essay: 서술형 주관식 */
export type QuestionType = 'choice' | 'short' | 'essay';
/** 문항에 붙는 자료 */
export type QuestionMedia = 'none' | 'image' | 'youtube';

export interface QuizDoc {
  title: string;
  description: string;
  visibility: HomeworkVisibility;
  questionCount: number;
  authorUid: string;
  authorName: string;
  createdAt: Timestamp;
}

/**
 * 문항. **정답은 여기 두지 않는다.**
 * 읽기가 공개라 정답을 같이 넣으면 개발자도구로 그냥 보인다. 정답은 QuizAnswerKeyDoc 에 따로 둔다.
 */
export interface QuestionDoc {
  order: number;
  type: QuestionType;
  prompt: string;
  media: QuestionMedia;
  imageUrl: string;
  /** 유튜브 영상 id (전체 URL이 아니라 id만 저장한다) */
  youtubeId: string;
  /** 객관식 보기. 다른 유형에서는 빈 배열 */
  choices: string[];
  /** 교사가 직접 적은 해설 (없으면 AI가 만든다) */
  explanation: string;
  /** AI가 만들어 캐시해 둔 해설. 한 번 만들면 반 전체가 같은 걸 본다. */
  aiExplanation: string;
}

/** 정답. 교직원만 읽을 수 있고 쓰기는 서버 전용. 채점도 서버에서 한다. */
export interface QuizAnswerKeyDoc {
  /** 객관식 정답 보기 번호 (0부터) */
  answerIndex: number | null;
  /** 단답형에서 정답으로 인정할 표기들 */
  acceptable: string[];
  /** 서술형은 정답이 없다 (교사가 읽고 판단) */
}

/** 한 문항에 대한 학생의 답 */
export interface QuizAnswer {
  questionId: string;
  type: QuestionType;
  choiceIndex: number | null;
  text: string;
  /** 서술형은 채점하지 않으므로 null */
  correct: boolean | null;
}

/** 제출물. 문서 ID = 학생 uid. 점수는 아이에게 보여주지 않는다. */
export interface QuizSubmissionDoc {
  studentUid: string;
  studentName: string;
  answers: QuizAnswer[];
  /** 교사 화면 정렬·요약용. 서술형은 세지 않는다. */
  correctCount: number;
  gradedCount: number;
  publicToClass: boolean;
  submittedAt: Timestamp;
}

// ---------- 틀린그림 찾기 ----------

/** 두 그림을 위아래로 놓을지 좌우로 놓을지. 사진 비율에 따라 자동으로 정한다. */
export type SpotLayout = 'vertical' | 'horizontal';

export interface SpotGameDoc {
  title: string;
  /** 원본 사진 */
  originalUrl: string;
  /** AI가 만든 변형 사진 */
  variantUrl: string;
  layout: SpotLayout;
  /** 찾아야 할 개수 (answerKey 를 못 읽는 학생에게도 알려줘야 한다) */
  spotCount: number;
  visibility: HomeworkVisibility;
  authorUid: string;
  authorName: string;
  createdAt: Timestamp;
}

/**
 * 정답 좌표. **학생은 절대 읽으면 안 된다** — 읽히면 게임이 성립하지 않는다.
 * 퀴즈 정답지와 같은 이유로 따로 두고, 맞았는지 판정도 서버가 한다.
 */
export interface SpotAnswerKeyDoc {
  /** 정규화 좌표(0~1)와 허용 반경 */
  spots: { x: number; y: number; r: number }[];
}

/** 한 아이의 풀이. 문서 ID = 학생 uid */
export interface SpotPlayDoc {
  studentUid: string;
  studentName: string;
  /** 찾아낸 정답 인덱스 */
  found: number[];
  /** 헛짚은 횟수 (순위에 벌점으로 쓴다) */
  misses: number;
  /** 다 찾는 데 걸린 시간(초). 아직 진행 중이면 null */
  seconds: number | null;
  startedAt: Timestamp;
  completedAt: Timestamp | null;
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
  | 'avatar_01' | 'avatar_02' | 'avatar_03' | 'avatar_04'
  | 'avatar_05' | 'avatar_06' | 'avatar_07' | 'avatar_08'
  | 'avatar_09' | 'avatar_10' | 'avatar_11' | 'avatar_12'
  | 'avatar_13' | 'avatar_14' | 'avatar_15' | 'avatar_16';

/**
 * 프리셋 위에 덧입히는 색. 같은 캐릭터를 골라도 서로 구분되게 한다.
 * 상점 아이템(avatarCustom)과 달리 사고파는 게 아니라 취향이라 클라이언트가 직접 바꾼다.
 */
export interface AvatarTint {
  shirt: string | null;
  hair: string | null;
}
