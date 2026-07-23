/**
 * 도전 골든벨 — 규칙 검증.
 *
 * **채점이 아는 아이를 틀렸다고 하지 않는가**가 절반이다.
 * 주관식에서 '7 일' 이나 '７' 을 틀렸다고 하면, 아는 아이가 자리에서 물러난다.
 *
 * 실행: node --experimental-strip-types scripts/verify-goldenbell.mjs
 */
import {
  BELL_QUESTIONS, pickBellQuestions, isCorrect, answerText, bellOutcome,
  timeFor, MAX_SEATS, TOTAL_ROUNDS, CHOICE_MS, SHORT_MS,
} from '../src/lib/goldenbell.ts';

let pass = 0;
const fails = [];
const ok = (n, c) => (c ? pass++ : fails.push(n));

// ── 문제 은행 ────────────────────────────────────────────
ok('문제가 넉넉하다', BELL_QUESTIONS.length >= TOTAL_ROUNDS * 2);
ok('다섯 단계가 다 있다', [1, 2, 3, 4, 5].every((lv) => BELL_QUESTIONS.some((q) => q.level === lv)));
ok('문제 글이 겹치지 않는다', new Set(BELL_QUESTIONS.map((q) => q.q)).size === BELL_QUESTIONS.length);
ok('모든 문제에 왜 그런지가 붙어 있다', BELL_QUESTIONS.every((q) => q.why.length >= 5));

/** 객관식은 보기가 넷이고, 정답 번호가 그 안에 있어야 한다 */
for (const q of BELL_QUESTIONS.filter((x) => x.kind === 'choice')) {
  ok(`[${q.q.slice(0, 12)}] 보기가 4개다`, q.choices?.length === 4);
  ok(`[${q.q.slice(0, 12)}] 정답 번호가 보기 안에 있다`,
    typeof q.answer === 'number' && q.answer >= 0 && q.answer < (q.choices?.length ?? 0));
  ok(`[${q.q.slice(0, 12)}] 보기가 겹치지 않는다`, new Set(q.choices).size === q.choices?.length);
}

/** 주관식은 인정하는 답이 있어야 한다 */
for (const q of BELL_QUESTIONS.filter((x) => x.kind === 'short')) {
  ok(`[${q.q.slice(0, 12)}] 인정하는 답이 있다`, Array.isArray(q.answer) && q.answer.length >= 1);
  ok(`[${q.q.slice(0, 12)}] 보기가 없다`, q.choices === undefined);
}

/**
 * **정답 번호가 한쪽으로 쏠리면 안 된다.**
 * 늘 3번이면 아이들이 금방 알아채고 찍는다.
 */
const choiceQs = BELL_QUESTIONS.filter((q) => q.kind === 'choice');
const counts = [0, 0, 0, 0];
for (const q of choiceQs) counts[q.answer]++;
ok(`정답 번호가 골고루다 (${counts.join('/')})`, counts.every((c) => c >= choiceQs.length * 0.1));

// 객관식·주관식이 둘 다 넉넉해야 섞을 수 있다
const shortCount = BELL_QUESTIONS.filter((q) => q.kind === 'short').length;
ok('객관식과 주관식이 둘 다 넉넉하다', choiceQs.length >= 10 && shortCount >= 10);

// ── 채점 ─────────────────────────────────────────────────
const week = BELL_QUESTIONS.find((q) => q.q.includes('일주일'));
ok('주관식 정답을 맞다고 본다', isCorrect(week, '7일'));
ok('숫자만 적어도 맞다', isCorrect(week, '7'));
ok('공백이 섞여도 맞다', isCorrect(week, ' 7 일 '));
ok('전각 숫자도 맞다', isCorrect(week, '７일'));
ok('마침표가 붙어도 맞다', isCorrect(week, '7일.'));
ok('틀린 답은 틀리다', isCorrect(week, '5일') === false);
ok('빈 답은 틀리다', isCorrect(week, '') === false);
ok('공백만 낸 것도 틀리다', isCorrect(week, '   ') === false);
ok('아무것도 안 낸 것은 틀리다', isCorrect(week, undefined) === false);

const seoul = BELL_QUESTIONS.find((q) => q.q.includes('수도'));
ok('여러 표기를 인정한다 (서울)', isCorrect(seoul, '서울'));
ok('여러 표기를 인정한다 (서울특별시)', isCorrect(seoul, '서울특별시'));
ok('비슷하지만 다른 답은 틀리다', isCorrect(seoul, '부산') === false);

const rainbow = BELL_QUESTIONS.find((q) => q.kind === 'choice' && q.q.includes('무지개'));
ok('객관식은 번호로 맞힌다', isCorrect(rainbow, 2));
ok('다른 번호는 틀리다', isCorrect(rainbow, 0) === false);
ok('객관식에 글로 내면 틀리다', isCorrect(rainbow, '7가지') === false);
ok('객관식에 안 내면 틀리다', isCorrect(rainbow, undefined) === false);

ok('객관식 정답을 사람 말로 보여준다', answerText(rainbow).includes('7가지'));
ok('주관식 정답을 사람 말로 보여준다', answerText(week) === '7');

// ── 문제 뽑기 ────────────────────────────────────────────
const set1 = pickBellQuestions(4242);
ok('한 판 분량이 나온다', set1.length === TOTAL_ROUNDS);
ok('같은 문제가 두 번 안 나온다', new Set(set1.map((q) => q.q)).size === set1.length);
ok('같은 씨앗이면 같은 차례', JSON.stringify(pickBellQuestions(4242)) === JSON.stringify(set1));
ok('씨앗이 다르면 차례도 다르다', JSON.stringify(pickBellQuestions(77)) !== JSON.stringify(set1));

const avg = (xs) => xs.reduce((a, q) => a + q.level, 0) / xs.length;
ok('뒤로 갈수록 어려워진다', avg(set1.slice(0, 5)) < avg(set1.slice(-5)));
ok('첫 문제는 제일 쉬운 단계다', set1[0].level === 1);
ok('마지막 문제는 어려운 단계다', set1[set1.length - 1].level >= 4);
ok('객관식과 주관식이 섞인다',
  set1.some((q) => q.kind === 'choice') && set1.some((q) => q.kind === 'short'));

// 학년을 골라도 판이 성립해야 한다
for (const g of [3, 4, 5, 6]) {
  const s = pickBellQuestions(9, TOTAL_ROUNDS, g);
  ok(`${g}학년으로 뽑아도 한 판이 나온다`, s.length === TOTAL_ROUNDS);
  ok(`${g}학년 판도 같은 문제가 두 번 안 나온다`, new Set(s.map((q) => q.q)).size === s.length);
  ok(`${g}학년 판에도 두 가지가 섞인다`,
    s.some((q) => q.kind === 'choice') && s.some((q) => q.kind === 'short'));
}

// ── 시간 ─────────────────────────────────────────────────
ok('주관식이 객관식보다 시간이 길다', SHORT_MS > CHOICE_MS);
ok('객관식 시간을 제대로 준다', timeFor('choice') === CHOICE_MS);
ok('주관식 시간을 제대로 준다', timeFor('short') === SHORT_MS);
ok('자리는 30개까지', MAX_SEATS === 30);

// ── 판 끝내기 ────────────────────────────────────────────
ok('중간에는 안 끝난다', bellOutcome(['a', 'b', 'c'], ['a', 'b'], 5, 15).done === false);
ok('한 명 남아도 문제는 계속 낸다', bellOutcome(['a', 'b'], ['a'], 5, 15).done === false);

/** **우승이 여러 명일 수 있다** — 골든벨의 요점이다 */
const many = bellOutcome(['a', 'b', 'c'], ['a', 'b'], 15, 15);
ok('마지막까지 남으면 끝난다', many.done === true);
ok('여럿이 함께 우승할 수 있다', many.winners.length === 2 && many.winners.join() === 'a,b');

const one = bellOutcome(['a', 'b'], ['a'], 15, 15);
ok('혼자 남으면 혼자 우승', one.winners.join() === 'a');

const wipe = bellOutcome(['a', 'b'], [], 9, 15);
ok('전원이 틀리면 판이 끝난다', wipe.done === true);
ok('전원이 틀려도 우승자가 있다', wipe.winners.join() === 'a,b');

console.log(fails.length === 0 ? `✅ ${pass}개 통과` : `❌ ${fails.length}개 실패 (${pass}개 통과)`);
fails.forEach((f) => console.log('   -', f));
process.exit(fails.length === 0 ? 0 : 1);
