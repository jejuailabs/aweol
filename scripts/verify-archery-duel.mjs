import {
  whoseTurn, shotIndexOf, isReady, isDone, duelResult, totalOf,
  DUEL_SHOTS,
} from '../src/lib/archery-duel.ts';
let f=0; const ok=(n,c)=>{console.log((c?'✓':'✗')+' '+n); if(!c)f++;};
const P=(uid,name,shots=[])=>({uid,name,shots});
const room=(players,size=2)=>({players,size});

console.log('--- 모여야 시작 ---');
ok('혼자면 아직 안 됨', !isReady(room([P('a','A')])));
ok('둘 모이면 시작', isReady(room([P('a','A'),P('b','B')])));

console.log('--- 번갈아 돈다 ---');
{
  let s = room([P('a','A'),P('b','B')]);
  ok('처음엔 1번(a) 차례', whoseTurn(s)==='a');
  s.players[0].shots.push(8);         // a 한 발
  ok('그다음 2번(b) 차례', whoseTurn(s)==='b');
  s.players[1].shots.push(5);         // b 한 발
  ok('다시 1번(a) 차례', whoseTurn(s)==='a');
  ok('a 의 다음 화살은 1번째(0-index)', shotIndexOf(s,'a')===1);
  ok('b 의 다음 화살도 1번째', shotIndexOf(s,'b')===1);
}

console.log('--- 한쪽이 더 쐈으면 적게 쏜 쪽 차례 ---');
{
  const s = room([P('a','A',[8,8,8]),P('b','B',[5])]);
  ok('덜 쏜 b 차례', whoseTurn(s)==='b');
}

console.log('--- 끝과 승부 ---');
{
  const s = room([P('a','A',[10,10,10,10,10]),P('b','B',[1,1,1,1,1])]);
  ok('둘 다 5발 쐈으면 끝', isDone(s));
  ok('끝나면 차례 없음', whoseTurn(s)===null);
  const r = duelResult(s);
  ok('점수 높은 a 승', r.winnerUid==='a' && !r.draw);
  ok('총점이 맞다', r.totals.a===50 && r.totals.b===5);
}
{
  const s = room([P('a','A',[5,5,5,5,5]),P('b','B',[5,5,5,5,5])]);
  const r = duelResult(s);
  ok('같은 점수면 비김', r.draw && r.winnerUid===null);
}
{
  const s = room([P('a','A',[10]),P('b','B',[])]);
  ok('안 끝났으면 결과 null', duelResult(s)===null);
}

console.log('--- 한 발도 0 이하로 안 샌다 ---');
ok('빈 판 총점 0', totalOf(P('a','A'))===0);
ok(`${DUEL_SHOTS}발이 정원`, DUEL_SHOTS===5);

console.log('--- 3발씩 주고받는 전체 흐름 ---');
{
  const s = room([P('a','A'),P('b','B')]);
  const order = [];
  for (let i=0;i<DUEL_SHOTS*2;i++){
    const t = whoseTurn(s);
    order.push(t);
    s.players.find(p=>p.uid===t).shots.push(7);
  }
  ok('열 번 다 번갈아 돈다', order.join('')==='ababababab');
  ok('다 쏘면 끝', isDone(s));
}

console.log(`\n실패 ${f}건`); process.exit(f?1:0);
