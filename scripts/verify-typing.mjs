/**
 * 한글 타수 세기 검증.
 *
 * **판정 코드를 베껴 쓰지 않는다** — `src/lib/typing.ts` 를 그대로 불러온다.
 *
 * 여기가 틀리면 **랭킹이 통째로 의미가 없다.** 글자 수로 세면 받침 있는 말을
 * 치는 아이가 손해를 보고, 겹모음을 1타로 세면 '과일' 이 '가일' 보다 쉬워진다.
 *
 * 실행: node --experimental-strip-types scripts/verify-typing.mjs
 */
import {
  countStrokes, strokesPerMinute, rainLevel, pickWord, RAIN_LEVELS, RAIN_WORDS, PRACTICE_LINES,
} from '../src/lib/typing.ts';

let failed = 0;
const ok = (n, c, extra = '') => {
  console.log(`${c ? '✓' : '✗'} ${n}${extra ? ' — ' + extra : ''}`);
  if (!c) failed++;
};
const eq = (label, text, want) =>
  ok(`${label}: '${text}' = ${want}타`, countStrokes(text) === want, String(countStrokes(text)));

console.log('[받침이 없으면 2타, 있으면 3타]');
eq('민글자', '가', 2);          // ㄱ ㅏ
eq('받침', '강', 3);            // ㄱ ㅏ ㅇ
eq('두 글자', '학교', 5);        // ㅎㅏㄱ + ㄱㅛ
eq('세 글자', '운동장', 9);      // ㅇㅜㄴ(3) + ㄷㅗㅇ(3) + ㅈㅏㅇ(3)

console.log('\n[겹모음은 풀어 센다 — 이걸 1타로 세면 과일이 가일보다 쉬워진다]');
eq('ㅘ', '과', 3);              // ㄱ ㅗ ㅏ
eq('ㅙ', '괘', 4);              // ㄱ ㅗ ㅐ
eq('ㅚ', '외', 3);              // ㅇ ㅗ ㅣ
eq('ㅝ', '워', 3);
eq('ㅢ', '의', 3);
ok('과일 > 가일', countStrokes('과일') > countStrokes('가일'),
  `${countStrokes('과일')} vs ${countStrokes('가일')}`);

console.log('\n[겹받침도 풀어 센다]');
eq('ㅄ', '값', 4);              // ㄱ ㅏ ㅂ ㅅ
eq('ㄺ', '닭', 4);              // ㄷ ㅏ ㄹ ㄱ
eq('ㄶ', '많', 4);

console.log('\n[쌍자음은 1타로 정했다 (시프트는 안 센다)]');
eq('ㄲ', '까', 2);
eq('ㅆ 받침', '았', 3);

console.log('\n[한글이 아닌 것]');
eq('띄어쓰기', '가 나', 5);      // 2 + 1 + 2
eq('영문', 'abc', 3);
eq('숫자·기호', '1+2!', 4);
eq('빈 글', '', 0);

console.log('\n[문장]');
const line = '한라산에 눈이 내리면';
ok(`'${line}' 은 글자 수(${[...line].length})보다 타수(${countStrokes(line)})가 많다`,
  countStrokes(line) > [...line].length);

console.log('\n[분당 타수]');
ok('300타를 1분에 = 300', strokesPerMinute(300, 60000) === 300, String(strokesPerMinute(300, 60000)));
ok('150타를 30초에 = 300', strokesPerMinute(150, 30000) === 300, String(strokesPerMinute(150, 30000)));
ok('0초는 0으로 (나누기 사고 방지)', strokesPerMinute(100, 0) === 0);
ok('음수 시간도 0', strokesPerMinute(100, -5) === 0);

console.log('\n[난이도]');
ok('1~5 다섯 단계', RAIN_LEVELS.length === 5);
ok('올라갈수록 빨라진다',
  RAIN_LEVELS.every((l, i) => i === 0 || l.fallMs < RAIN_LEVELS[i - 1].fallMs));
ok('올라갈수록 많이 떨어진다',
  RAIN_LEVELS.every((l, i) => i === 0 || l.maxOnScreen >= RAIN_LEVELS[i - 1].maxOnScreen));
ok('모르는 값은 가운데(3단계)로', rainLevel('abc').level === 3, String(rainLevel('abc').level));
ok('숫자 문자열도 받는다', rainLevel('5').level === 5);

console.log('\n[낱말 고르기]');
for (const lv of RAIN_LEVELS) {
  const words = Array.from({ length: 60 }, () => pickWord(lv));
  const allFit = words.every((w) => w.length >= lv.minLen && w.length <= lv.maxLen);
  ok(`${lv.label} 은 ${lv.minLen}~${lv.maxLen}글자만 준다`, allFit,
    words.find((w) => w.length < lv.minLen || w.length > lv.maxLen) ?? '');
  ok(`  ${lv.label} 은 빈손으로 안 준다`, words.every((w) => w.length > 0));
}

console.log('\n[재료가 성한가]');
ok('낱말에 빈 것·공백이 없다', RAIN_WORDS.every((w) => w.trim() === w && w.length > 0));
ok('낱말이 겹치지 않는다', new Set(RAIN_WORDS).size === RAIN_WORDS.length,
  `${RAIN_WORDS.length} → ${new Set(RAIN_WORDS).size}`);
ok('연습 문장이 열 개 이상', PRACTICE_LINES.length >= 10, String(PRACTICE_LINES.length));
ok('연습 문장이 너무 길지 않다(30자 이하)',
  PRACTICE_LINES.every((s) => [...s].length <= 30),
  PRACTICE_LINES.find((s) => [...s].length > 30) ?? '');

console.log(`\n실패 ${failed}건`);
process.exit(failed > 0 ? 1 : 0);
