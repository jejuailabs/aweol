/**
 * 학교 단위 Firestore 경로 헬퍼.
 * 예전에는 SCHOOL_ID 를 파일마다 하드코딩했는데, 지도에서 여러 학교로 들어오게 되면서
 * 모든 경로가 schoolId 를 받도록 바뀌었다. 문자열을 직접 조립하지 말고 이 함수들을 쓴다.
 */

/** 기존 단일 학교 시절에 만들어진 데이터의 학교 ID (마이그레이션 없이 계속 쓴다) */
export const LEGACY_SCHOOL_ID = 'aewol-elementary';

export const schoolPath = (schoolId: string) => `schools/${schoolId}`;

export const classesPath = (schoolId: string) => `schools/${schoolId}/classes`;

export const classPath = (schoolId: string, classId: string) =>
  `schools/${schoolId}/classes/${classId}`;

export const studentsPath = (schoolId: string, classId: string) =>
  `${classPath(schoolId, classId)}/students`;

export const activitiesPath = (schoolId: string, classId: string) =>
  `${classPath(schoolId, classId)}/activities`;

export const artworksPath = (schoolId: string, classId: string, activityId: string) =>
  `${activitiesPath(schoolId, classId)}/${activityId}/artworks`;

export const noticesPath = (schoolId: string, classId: string) =>
  `${classPath(schoolId, classId)}/notices`;

export const homeworksPath = (schoolId: string, classId: string) =>
  `${classPath(schoolId, classId)}/homeworks`;

export const submissionsPath = (schoolId: string, classId: string, homeworkId: string) =>
  `${homeworksPath(schoolId, classId)}/${homeworkId}/submissions`;

export const nudgesPath = (schoolId: string, classId: string, homeworkId: string) =>
  `${homeworksPath(schoolId, classId)}/${homeworkId}/nudges`;

export const readsPath = (schoolId: string, classId: string, homeworkId: string) =>
  `${homeworksPath(schoolId, classId)}/${homeworkId}/reads`;

export const quizzesPath = (schoolId: string, classId: string) =>
  `${classPath(schoolId, classId)}/quizzes`;

export const questionsPath = (schoolId: string, classId: string, quizId: string) =>
  `${quizzesPath(schoolId, classId)}/${quizId}/questions`;

export const quizSubmissionsPath = (schoolId: string, classId: string, quizId: string) =>
  `${quizzesPath(schoolId, classId)}/${quizId}/submissions`;

/**
 * 게임 스테이지 — 한 반이 한 해 동안 쌓아가는 것.
 *
 * 스테이지 하나 = 낱말 묶음 하나 = 그날 배운 것.
 * 게임 종류(짝맞추기·빙고…)는 이 재료를 **나눠 쓴다.**
 * 게임마다 따로 만들게 하면 선생님이 안 쓴다.
 */
export const stagesPath = (schoolId: string, classId: string) =>
  `${classPath(schoolId, classId)}/stages`;

/** 아이별 기록. 스테이지 아래 둬서 '이 스테이지 누가 했나'를 한 번에 본다. */
export const stagePlaysPath = (schoolId: string, classId: string, stageId: string) =>
  `${stagesPath(schoolId, classId)}/${stageId}/plays`;

export const spotGamesPath = (schoolId: string, classId: string) =>
  `${classPath(schoolId, classId)}/spotGames`;

export const spotPlaysPath = (schoolId: string, classId: string, gameId: string) =>
  `${spotGamesPath(schoolId, classId)}/${gameId}/plays`;

export const blackboardPath = (schoolId: string, classId: string) =>
  `${classPath(schoolId, classId)}/blackboard`;

export const inventoryPath = (uid: string) => `users/${uid}/inventory`;

export const stampLedgerPath = (uid: string) => `users/${uid}/stampLedger`;

export const rosterUploadsPath = (schoolId: string) => `schools/${schoolId}/rosterUploads`;

export const studentCodesPath = (schoolId: string) => `schools/${schoolId}/studentCodes`;

// ---------- 화면 경로 ----------

export const schoolUrl = (schoolId: string) => `/school/${schoolId}`;

export const classUrl = (schoolId: string, classId: string) =>
  `/school/${schoolId}/class/${classId}`;

export const roomUrl = (schoolId: string, classId: string) =>
  `${classUrl(schoolId, classId)}/room`;

export const activityUrl = (schoolId: string, classId: string, activityId: string) =>
  `${classUrl(schoolId, classId)}/activity/${activityId}`;

export const adminUrl = (schoolId: string) => `/admin/${schoolId}`;
