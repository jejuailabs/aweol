/**
 * 광장 OX 퀴즈 — 규칙 검증.
 *
 * **여기서 보는 것은 판정이 아니라 놀이가 성립하는가다.**
 * 첫 문제에 전원이 나가거나, 아무도 못 이기거나, 같은 문제가 두 번 나오면
 * 판이 깨진다. 그런 것들을 막는다.
 *
 * 실행: node --experimental-strip-types scripts/verify-ox-quiz.mjs
 */
import {
  OX_QUESTIONS, pickQuestions, judgeRound, roundOutcome,
  ANSWER_MS, REVEAL_MS, MAX_ROUNDS,
} from '../src/lib/ox-quiz.ts';

let pass = 0;
const fails = [];
const ok = (n, c) => (c ? pass++ : fails.push(n));

// ── 문제 은행 ────────────────────────────────────────────
ok('문제가 넉넉하다 (20개 이상)', OX_QUESTIONS.length >= 20);
ok('세 단계가 다 있다', [1, 2, 3].every((lv) => OX_QUESTIONS.some((q) => q.level === lv)));
ok('정답은 O 아니면 X', OX_QUESTIONS.every((q) => q.a === 'O' || q.a === 'X'));
ok('문제 글이 겹치지 않는다', new Set(OX_QUESTIONS.map((q) => q.q)).size === OX_QUESTIONS.length);
ok('모든 문제에 왜 그런지가 붙어 있다', OX_QUESTIONS.every((q) => q.why.length >= 5));
ok('학년이 1~6 안에 있다', OX_QUESTIONS.every((q) => q.grade >= 1 && q.grade <= 6));

/**
 * **O 만 찍어도 이기면 안 된다.**
 * 정답이 한쪽으로 쏠려 있으면 아이들이 금방 알아채고 한쪽에만 몰려 선다.
 */
const oCount = OX_QUESTIONS.filter((q) => q.a === 'O').length;
const ratio = oCount / OX_QUESTIONS.length;
ok(`O 와 X 가 한쪽으로 안 쏠린다 (O ${oCount}/${OX_QUESTIONS.length})`, ratio >= 0.35 && ratio <= 0.65);

// 단계별로도 한쪽으로 쏠리면 안 된다 (뒤로 갈수록 다 O 면 마지막이 시시하다)
for (const lv of [1, 2, 3]) {
  const g = OX_QUESTIONS.filter((q) => q.level === lv);
  const r = g.filter((q) => q.a === 'O').length / g.length;
  ok(`${lv}단계도 한쪽으로 안 쏠린다`, r >= 0.3 && r <= 0.7);
}

// ── 문제 뽑기 ────────────────────────────────────────────
const set1 = pickQuestions(12345);
ok('한 판에 낼 문제가 나온다', set1.length >= 10);
ok('같은 문제가 두 번 안 나온다', new Set(set1.map((q) => q.q)).size === set1.length);
ok('같은 씨앗이면 같은 차례', JSON.stringify(pickQuestions(12345)) === JSON.stringify(set1));
ok('씨앗이 다르면 차례도 다르다', JSON.stringify(pickQuestions(999)) !== JSON.stringify(set1));

/**
 * **쉬운 것부터 낸다.** 첫 문제에서 절반이 나가면 나머지가 시시해진다.
 */
const firstThird = set1.slice(0, Math.floor(set1.length / 3));
const lastThird = set1.slice(-Math.floor(set1.length / 3));
const avg = (xs) => xs.reduce((a, q) => a + q.level, 0) / xs.length;
ok('앞쪽이 뒤쪽보다 쉽다', avg(firstThird) < avg(lastThird));
ok('첫 문제는 1단계다', set1[0].level === 1);

// 학년을 줘도 판이 성립해야 한다 (문제가 모자라면 전체에서 뽑는다)
for (const g of [1, 2, 3, 4, 5, 6]) {
  const s = pickQuestions(7, MAX_ROUNDS, g);
  ok(`${g}학년으로 뽑아도 문제가 나온다`, s.length >= 8);
  ok(`${g}학년 판에도 같은 문제가 두 번 안 나온다`, new Set(s.map((q) => q.q)).size === s.length);
}

// ── 판정 ─────────────────────────────────────────────────
const alive = ['a', 'b', 'c', 'd'];
const r1 = judgeRound(alive, { a: 'O', b: 'X', c: 'O' }, 'O');
ok('맞힌 사람만 남는다', r1.survivors.join() === 'a,c');
ok('틀린 사람은 떨어진다', r1.eliminated.includes('b'));
ok('아무 데도 안 간 사람도 떨어진다', r1.eliminated.includes('d'));

const r2 = judgeRound(['a'], { a: 'X' }, 'X');
ok('혼자 남아도 맞히면 남는다', r2.survivors.join() === 'a');

// 이미 떨어진 사람은 애초에 alive 에 없다 — 두 번 떨어지지 않는다
const r3 = judgeRound(['a', 'c'], { a: 'O', b: 'O', c: 'X' }, 'O');
ok('떨어진 사람은 다시 안 센다', r3.survivors.join() === 'a' && r3.eliminated.join() === 'c');

// ── 판 끝내기 ────────────────────────────────────────────
ok('한 명 남으면 끝', roundOutcome(['a', 'b'], ['a'], 3, 20).done === true);
ok('그 한 명이 우승', roundOutcome(['a', 'b'], ['a'], 3, 20).winners.join() === 'a');
ok('여럿 남으면 계속', roundOutcome(['a', 'b', 'c'], ['a', 'b'], 3, 20).done === false);

/**
 * **아무도 못 이기는 판은 없다.**
 * 어려운 문제 하나에 전원이 나가면 그 문제를 없던 것으로 하고
 * 직전에 남아 있던 사람들이 그대로 이긴다.
 */
const wipe = roundOutcome(['a', 'b', 'c'], [], 5, 20);
ok('전원이 틀리면 판이 끝난다', wipe.done === true);
ok('전원이 틀리면 직전 사람들이 우승', wipe.winners.join() === 'a,b,c');
ok('전원이 틀려도 우승자가 있다', wipe.winners.length > 0);

// 문제를 다 냈는데도 여럿 남으면 그 사람들 모두 우승
const last = roundOutcome(['a', 'b', 'c'], ['a', 'b'], 20, 20);
ok('문제를 다 내면 남은 사람 모두 우승', last.done === true && last.winners.join() === 'a,b');

// ── 시간 ─────────────────────────────────────────────────
ok('답 고르는 시간이 10초', ANSWER_MS === 10_000);
ok('정답은 3초 뒤에 열린다', REVEAL_MS === 3_000);
ok('문제 수가 문제 은행을 넘지 않는다', MAX_ROUNDS <= OX_QUESTIONS.length);

console.log(fails.length === 0 ? `✅ ${pass}개 통과` : `❌ ${fails.length}개 실패 (${pass}개 통과)`);
fails.forEach((f) => console.log('   -', f));
process.exit(fails.length === 0 ? 0 : 1);
