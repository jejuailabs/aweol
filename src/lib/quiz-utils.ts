/**
 * 퀴즈 공통 유틸. 서버(채점)와 클라이언트(입력 검증)가 같은 규칙을 써야 하므로 여기 모은다.
 */

/**
 * 단답형 채점용 정규화.
 * 초등학생 답에서 맞고 틀림을 가르는 건 공백과 문장부호가 아니다.
 * "3 개", "3개.", "３개" 를 다르게 보면 아는 아이가 틀린 것으로 나온다.
 */
export function normalizeAnswer(s: string): string {
  return s
    .normalize('NFKC')        // 전각 숫자·영문을 반각으로
    .toLowerCase()
    .replace(/\s+/g, '')      // 공백 전부 제거
    .replace(/[.,!?~"'`·:;()[\]{}]/g, '')
    .trim();
}

/** 단답형 정답 판정 — 허용 표기 중 하나와 같으면 정답 */
export function isShortAnswerCorrect(given: string, acceptable: string[]): boolean {
  const g = normalizeAnswer(given);
  if (!g) return false;
  return acceptable.some((a) => normalizeAnswer(a) === g);
}

/**
 * 유튜브 링크에서 영상 id 만 뽑는다.
 * 아이들·선생님이 붙여넣는 형태가 제각각이라(공유 링크, 짧은 링크, 임베드, Shorts)
 * 전부 받아준다. 못 알아보면 빈 문자열.
 */
export function parseYoutubeId(input: string): string {
  const s = (input || '').trim();
  if (!s) return '';

  // 이미 id 만 들어온 경우
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;

  const patterns = [
    /[?&]v=([A-Za-z0-9_-]{11})/,        // watch?v=ID
    /youtu\.be\/([A-Za-z0-9_-]{11})/,   // youtu.be/ID
    /\/embed\/([A-Za-z0-9_-]{11})/,     // /embed/ID
    /\/shorts\/([A-Za-z0-9_-]{11})/,    // /shorts/ID
    /\/live\/([A-Za-z0-9_-]{11})/,      // /live/ID
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (m) return m[1];
  }
  return '';
}

export const youtubeEmbedUrl = (id: string) =>
  `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1`;

export const youtubeThumbUrl = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

export const MAX_QUESTIONS = 20;
export const MAX_CHOICES = 5;
export const MAX_PROMPT = 500;
export const MAX_ANSWER_TEXT = 2000;
