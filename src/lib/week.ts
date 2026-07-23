/**
 * '이번 주' 를 문자열 하나로.
 *
 * 순위표를 주 단위로 비우려고 쓴다. **기록을 지우지 않는다** — 지금 주의 열쇠와
 * 다른 기록을 안 보여줄 뿐이다. 지우면 아이가 지난주에 잘 쏜 것도 사라진다.
 *
 * **한국 시간으로 센다.** 서버는 UTC 로 도는데 그대로 쓰면 월요일 오전 9시 전에
 * 낸 기록이 지난주로 들어간다 — 아이는 분명 월요일에 쐈는데 순위표에 없다.
 *
 * 주는 **월요일에 시작**한다(ISO). 학교가 월요일에 시작하니 그게 자연스럽다.
 */

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 예: `2026-W30`
 *
 * ISO 주차 계산: 그 주의 **목요일**이 속한 해가 그 주의 해다.
 * (12월 말·1월 초에 주가 해를 걸치기 때문이다. 이 규칙이 없으면
 *  1월 1일이 낀 주가 두 해로 갈라져 순위표가 둘로 쪼개진다)
 */
export function weekKeyKST(at: Date | number = Date.now()): string {
  const ms = typeof at === 'number' ? at : at.getTime();
  // KST 로 옮겨 놓고 UTC 함수로 읽으면 시간대 계산이 한 번으로 끝난다
  const d = new Date(ms + KST_OFFSET_MS);

  // 일요일(0)을 7로 바꿔 월요일부터 1..7 이 되게 한다
  const dow = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  // 그 주의 목요일로 옮긴다
  const thursday = new Date(d.getTime() + (4 - dow) * DAY_MS);
  const year = thursday.getUTCFullYear();

  const jan1 = Date.UTC(year, 0, 1);
  const week = Math.floor((thursday.getTime() - jan1) / DAY_MS / 7) + 1;
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** 이번 주가 언제 끝나나 — 화면이 '월요일에 새로 시작해요' 라고 말할 수 있게 */
export function nextResetKST(at: Date | number = Date.now()): Date {
  const ms = typeof at === 'number' ? at : at.getTime();
  const d = new Date(ms + KST_OFFSET_MS);
  const dow = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  const daysLeft = 8 - dow; // 다음 월요일까지
  const monday = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + daysLeft);
  return new Date(monday - KST_OFFSET_MS);
}
