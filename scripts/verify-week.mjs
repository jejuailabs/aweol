/**
 * '이번 주' 세는 법 검증.
 *
 * **판정 코드를 베껴 쓰지 않는다** — `src/lib/week.ts` 를 그대로 불러온다.
 *
 * 여기서 틀리면 아이가 **분명 쐈는데 순위표에 없는** 일이 난다. 특히
 * 월요일 새벽과 연말연시가 위험하다.
 *
 * 실행: node --experimental-strip-types scripts/verify-week.mjs
 */
import { weekKeyKST, nextResetKST } from '../src/lib/week.ts';

let failed = 0;
const ok = (n, c, extra = '') => {
  console.log(`${c ? '✓' : '✗'} ${n}${extra ? ' — ' + extra : ''}`);
  if (!c) failed++;
};

/** 한국 시각을 그대로 적어 UTC 로 바꾼다 (KST = UTC+9) */
const kst = (y, m, d, hh = 0, mm = 0) => new Date(Date.UTC(y, m - 1, d, hh - 9, mm));

console.log('[한 주 안에서는 같은 열쇠]');
const mon = weekKeyKST(kst(2026, 7, 20, 9));   // 월
const wed = weekKeyKST(kst(2026, 7, 22, 15));  // 수
const sun = weekKeyKST(kst(2026, 7, 26, 23));  // 일 밤
ok('월·수·일이 같은 주', mon === wed && wed === sun, `${mon} / ${wed} / ${sun}`);

console.log('\n[주가 바뀌면 열쇠도 바뀐다]');
const sunLate = weekKeyKST(kst(2026, 7, 26, 23, 59));
const monEarly = weekKeyKST(kst(2026, 7, 27, 0, 1));
ok('일요일 밤과 월요일 새벽은 다른 주', sunLate !== monEarly, `${sunLate} → ${monEarly}`);

console.log('\n[한국 시간으로 센다 — 이걸 놓치면 월요일 아침 기록이 지난주로 간다]');
/**
 * 한국 월요일 오전 8시는 UTC 로는 아직 **일요일 23시**다.
 * UTC 로 세면 이 기록이 지난주로 들어가서, 아이는 월요일에 쐈는데 표에 없다.
 */
const monMorningKST = weekKeyKST(kst(2026, 7, 27, 8));
ok('한국 월요일 오전은 새 주', monMorningKST === monEarly, `${monMorningKST} vs ${monEarly}`);
ok('한국 일요일 밤과는 다르다', monMorningKST !== sunLate);

console.log('\n[연말연시 — 주가 해를 걸칠 때]');
/**
 * 2026-12-28(월) ~ 2027-01-03(일) 은 **한 주**다.
 * 목요일(2026-12-31)이 속한 해가 그 주의 해라는 ISO 규칙이 없으면
 * 이 주가 2026 과 2027 로 쪼개져 **순위표가 둘로 갈라진다.**
 */
const dec28 = weekKeyKST(kst(2026, 12, 28, 12));
const jan1 = weekKeyKST(kst(2027, 1, 1, 12));
const jan3 = weekKeyKST(kst(2027, 1, 3, 12));
ok('12/28 과 1/1 이 같은 주', dec28 === jan1, `${dec28} / ${jan1}`);
ok('1/3(일)까지 같은 주', jan1 === jan3, `${jan1} / ${jan3}`);
const jan4 = weekKeyKST(kst(2027, 1, 4, 12));
ok('1/4(월)부터 새 주', jan4 !== jan3, `${jan3} → ${jan4}`);

console.log('\n[모양]');
ok('YYYY-Wnn 꼴', /^\d{4}-W\d{2}$/.test(mon), mon);

console.log('\n[언제 새로 시작하나]');
const reset = nextResetKST(kst(2026, 7, 22, 15)); // 수요일에 물어보면
const rk = new Date(reset.getTime() + 9 * 3600 * 1000);
ok('다음 월요일을 알려준다', rk.getUTCDay() === 1, rk.toISOString());
ok('그 시각은 이번 주보다 뒤', reset.getTime() > kst(2026, 7, 22, 15).getTime());
ok('그 시각의 주 열쇠는 다음 주', weekKeyKST(reset) !== wed, `${wed} → ${weekKeyKST(reset)}`);
// 월요일 0시에 물어보면 '오늘' 이 아니라 다음 월요일이어야 한다(이번 주는 이제 시작이니까)
const monReset = nextResetKST(kst(2026, 7, 27, 0, 1));
ok('월요일 새벽에 물으면 다음 월요일', weekKeyKST(monReset) !== monEarly,
  `${monEarly} → ${weekKeyKST(monReset)}`);

console.log(`\n실패 ${failed}건`);
process.exit(failed > 0 ? 1 : 0);
