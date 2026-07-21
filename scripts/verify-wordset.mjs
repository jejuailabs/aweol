import { parsePairs, buildMatchDeck, shuffle, isMatch, matchScore, scoreMatchRun, MAX_PAIRS }
  from '../src/lib/wordset.ts';
let f=0; const ok=(n,c)=>{console.log((c?'✓':'✗')+' '+n); if(!c)f++;};

console.log('--- 선생님이 붙여넣은 글 읽기 ---');
{
  const r = parsePairs('광합성=빛으로 양분을 만드는 일\n증산작용=물이 잎에서 빠져나가는 일');
  ok('= 로 나눈다', r.pairs.length===2 && r.pairs[0].a==='광합성');
  ok('뜻도 제대로', r.pairs[0].b==='빛으로 양분을 만드는 일');
  ok('문제 없음', r.problems.length===0);
}
ok('콜론도 받는다', parsePairs('가:나').pairs[0].b==='나');
ok('탭도 받는다', parsePairs('가\t나').pairs[0].b==='나');
ok('빈 줄은 그냥 넘어간다', parsePairs('가=나\n\n\n다=라').pairs.length===2);
ok('앞뒤 공백 정리', parsePairs('  가  =  나  ').pairs[0].a==='가');
{
  const r = parsePairs('가=나=다');
  ok('뜻 안에 = 가 또 있으면 첫 번째만 나눈다', r.pairs[0].a==='가' && r.pairs[0].b==='나=다');
}

console.log('--- 잘못된 줄은 버리지 않고 알려준다 ---');
{
  const r = parsePairs('가=나\n이건구분자가없다\n다=라');
  ok('맞는 줄은 살린다', r.pairs.length===2);
  ok('몇 번째 줄인지 알려준다', r.problems.length===1 && r.problems[0].startsWith('2번째 줄'));
}
{
  const r = parsePairs('가=\n=나');
  ok('한쪽이 비면 알려준다', r.pairs.length===0 && r.problems.length===2);
}
{
  const r = parsePairs('가=나\n가=다');
  ok('같은 낱말이 두 번이면 알려준다', r.pairs.length===1 && r.problems[0].includes('이미 있어요'));
}
{
  const r = parsePairs('가='+'너'.repeat(50));
  ok('너무 길면 알려준다', r.pairs.length===0 && r.problems[0].includes('너무 길어요'));
}
{
  const many = Array.from({length:MAX_PAIRS+5},(_,i)=>`낱말${i}=뜻${i}`).join('\n');
  const r = parsePairs(many);
  ok(`${MAX_PAIRS}개까지만 받는다`, r.pairs.length===MAX_PAIRS);
  ok('넘친 것도 알려준다', r.problems.length>0);
}
ok('빈 글은 조용히 빈 결과', parsePairs('').pairs.length===0 && parsePairs('').problems.length===0);

console.log('--- 짝맞추기 판 ---');
const PAIRS = Array.from({length:10},(_,i)=>({a:`낱말${i}`,b:`뜻${i}`}));
{
  const deck = buildMatchDeck(PAIRS, 42, 6);
  ok('6쌍이면 카드 12장', deck.length===12);
  ok('쌍마다 두 장씩', [...new Set(deck.map(c=>c.pairId))].length===6);
  const sides = deck.filter(c=>c.pairId===0).map(c=>c.side).sort();
  ok('한 쌍은 낱말 한 장 + 뜻 한 장', sides.join()==='a,b');
}
ok('쌍이 모자라면 있는 만큼만', buildMatchDeck(PAIRS.slice(0,2), 1, 6).length===4);
ok('쌍이 없으면 빈 판', buildMatchDeck([], 1, 6).length===0);

console.log('--- 섞기는 seed 로 (새로고침으로 쉬운 판 못 고른다) ---');
ok('같은 seed → 같은 배치',
   JSON.stringify(buildMatchDeck(PAIRS,7,6))===JSON.stringify(buildMatchDeck(PAIRS,7,6)));
ok('다른 seed → 다른 배치',
   JSON.stringify(buildMatchDeck(PAIRS,7,6))!==JSON.stringify(buildMatchDeck(PAIRS,8,6)));
{
  // 실제로 섞이긴 하는가 (제자리에 그대로 있으면 섞은 게 아니다)
  const src = Array.from({length:20},(_,i)=>i);
  const out = shuffle(src, 123);
  ok('원소는 그대로 다 있다', [...out].sort((x,y)=>x-y).join()===src.join());
  ok('순서는 바뀐다', out.join()!==src.join());
  ok('원본을 안 건드린다', src.join()===Array.from({length:20},(_,i)=>i).join());
}
{
  // 치우침이 심하면 안 된다 — 첫 자리에 오는 값이 골고루여야
  const seen = new Set();
  for (let s=1;s<=60;s++) seen.add(shuffle([0,1,2,3,4,5,6,7], s)[0]);
  ok(`첫 자리에 여러 값이 온다 (${seen.size}종)`, seen.size>=5);
}

console.log('--- 짝 판정 ---');
const card=(pairId,side,text='x')=>({pairId,side,text});
ok('같은 쌍의 낱말+뜻이면 짝', isMatch(card(1,'a'),card(1,'b')));
ok('순서 바뀌어도 짝', isMatch(card(1,'b'),card(1,'a')));
ok('다른 쌍이면 아니다', !isMatch(card(1,'a'),card(2,'b')));
ok('같은 쪽 두 장은 아니다 (글자가 같아도)', !isMatch(card(1,'a','같은글'),card(1,'a','같은글')));

console.log('--- 점수는 뒤집은 횟수로 ---');
ok('한 번도 안 틀리면 100점', matchScore(6,12)===100);
ok('많이 뒤집을수록 낮다', matchScore(6,24)<matchScore(6,16));
ok('아무리 틀려도 0 아래로 안 간다', matchScore(6,1000)>=0);
ok('최소보다 적게 뒤집어도 100 넘지 않는다', matchScore(6,4)===100);
ok('쌍이 없으면 0', matchScore(0,10)===0);


console.log('--- 서버가 되짚어 채점하기 (랭킹에 올리려면 필요) ---');
const P6 = PAIRS.slice(0, 6);
const SEED = 31;
const deck6 = buildMatchDeck(P6, SEED, 6);

/** 한 번도 안 틀린 순서 만들기 — 짝끼리 이어서 뒤집는다 */
const perfect = [];
{
  const used = new Set();
  for (let i = 0; i < deck6.length; i++) {
    if (used.has(i)) continue;
    const j = deck6.findIndex((c, k) => k !== i && !used.has(k) && isMatch(deck6[i], c));
    perfect.push(i, j);
    used.add(i); used.add(j);
  }
}
{
  const r = scoreMatchRun(P6, SEED, perfect);
  ok('한 번도 안 틀린 순서는 통과', r.ok);
  ok(`뒤집은 횟수가 12 (${r.flips})`, r.flips === 12);
  ok(`만점 (${r.score})`, r.score === 100);

  const wrong = deck6.findIndex((c, k) => k !== perfect[0] && !isMatch(deck6[perfect[0]], c));
  const withMiss = [perfect[0], wrong, ...perfect];
  const r2 = scoreMatchRun(P6, SEED, withMiss);
  ok('틀렸다가 다시 맞혀도 통과', r2.ok);
  ok(`틀린 만큼 횟수가 는다 (${r2.flips})`, r2.flips === 14);
  ok('그래서 점수가 낮아진다', r2.score < r.score);
}

console.log('--- 거짓 순서는 막힌다 ---');
{
  const bad = (o) => scoreMatchRun(P6, SEED, o);
  ok('덜 맞히고 냈으면 거부', !bad([perfect[0], perfect[1]]).ok);
  ok('빈 순서는 거부', !bad([]).ok);
  ok('홀수 개는 거부', !bad([0, 1, 2]).ok);
  ok('같은 카드를 두 번 뒤집으면 거부', !bad([0, 0]).ok);
  ok('없는 자리는 거부', !bad([0, 999]).ok);
  ok('음수 자리는 거부', !bad([-1, 0]).ok);
  ok('숫자가 아니면 거부', !bad(['0', '1']).ok);
  ok('배열이 아니면 거부', !bad('조작').ok);
  ok('null 이어도 안 터진다', !bad(null).ok);
  ok('끝없이 긴 입력은 거부', !bad(Array(1000).fill(0)).ok);
  ok('빈 낱말 묶음은 거부', !scoreMatchRun([], 1, [0, 1]).ok);
  ok('이미 맞힌 쌍을 또 내면 거부',
     !bad([perfect[0], perfect[1], perfect[0], perfect[1]]).ok);
  // 만점보다 좋은 척은 불가능하다 — 12장을 다 맞히려면 최소 12번이다
  ok('12번 미만으로 다 맞힐 수는 없다',
     !bad(perfect.slice(0, 10)).ok);
}

console.log(`\n실패 ${f}건`); process.exit(f?1:0);
