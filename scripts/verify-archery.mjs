import { shotSetup, aimAt, landing, ringScore, scoreRound, SHOTS, TARGET_R, PERFECT }
  from '../src/lib/archery.ts';
let f=0; const ok=(n,c)=>{console.log((c?'✓':'✗')+' '+n); if(!c)f++;};

console.log('--- 씨앗만으로 정해지는가 (서버가 다시 계산할 수 있어야 한다) ---');
ok('같은 씨앗·같은 화살 → 같은 조건',
   JSON.stringify(shotSetup(42,0))===JSON.stringify(shotSetup(42,0)));
ok('다른 씨앗 → 다른 조건',
   JSON.stringify(shotSetup(42,0))!==JSON.stringify(shotSetup(43,0)));
ok('같은 판이라도 화살마다 조건이 다르다',
   JSON.stringify(shotSetup(42,0))!==JSON.stringify(shotSetup(42,1)));
ok('같은 씨앗·같은 시각 → 같은 자리',
   JSON.stringify(landing(shotSetup(9,2), 1234))===JSON.stringify(landing(shotSetup(9,2), 1234)));

console.log('--- 흔들림 ---');
{
  const s = shotSetup(7,0);
  // 한 바퀴가 3.5초쯤이라 넉넉히 4초를 훑는다 (짧게 잡았다가 한쪽만 나왔다)
  const pts = Array.from({length:41},(_,k)=>aimAt(s,k*100));
  ok('가만히 있지 않는다', new Set(pts.map(p=>p.x.toFixed(2))).size > 3);
  ok('좌우로 다 간다',
     pts.some(p=>p.x>0) && pts.some(p=>p.x<0));
  ok('폭 안에서만 움직인다',
     pts.every(p=>Math.abs(p.x)<=s.swayX+1e-9 && Math.abs(p.y)<=s.swayY+1e-9));
  // 가로세로 빠르기가 같으면 대각선만 그린다 — 어긋나 있어야 한다
  const ratios = pts.filter(p=>Math.abs(p.x)>1).map(p=>(p.y/p.x).toFixed(2));
  ok('대각선으로만 왔다갔다하지 않는다', new Set(ratios).size > 2);
}
{
  let harder = true;
  for (let i=1;i<SHOTS;i++) {
    if (shotSetup(3,i).swayX <= shotSetup(3,i-1).swayX - 20) harder = false;
  }
  ok('뒤로 갈수록 대체로 어려워진다', harder);
}

console.log('--- 바람 ---');
{
  const withWind = shotSetup(11,0);
  const aim = aimAt(withWind, 500);
  const land = landing(withWind, 500);
  ok('바람이 옆으로 민다', Math.abs(Math.abs(land.x-aim.x) - Math.abs(withWind.wind)) < 1e-9);
  ok('위아래는 안 민다', land.y === aim.y);
}
{
  const winds = Array.from({length:40},(_,s)=>shotSetup(s+1,0).wind);
  ok('바람은 좌우 양쪽으로 분다', winds.some(w=>w>0) && winds.some(w=>w<0));
}

console.log('--- 점수 ---');
ok('한가운데는 10점', ringScore(0,0)===10);
ok('가장자리는 1점', ringScore(TARGET_R-0.5,0)===1);
ok('과녁 밖은 0점', ringScore(TARGET_R+1,0)===0);
ok('멀수록 낮다', ringScore(10,0) > ringScore(50,0) && ringScore(50,0) > ringScore(90,0));
ok('방향은 상관없다', ringScore(0,30)===ringScore(30,0) && ringScore(-30,0)===ringScore(30,0));
ok('1점 아래로는 안 간다 (과녁 안이면)', ringScore(TARGET_R,0)>=1);

console.log('--- 한 판 채점 (서버가 하는 일) ---');
{
  const r = scoreRound(5,[100,200,300,400,500]);
  ok(`화살 ${SHOTS}발을 센다`, r.shots.length===SHOTS);
  ok('총점은 합', r.total===r.shots.reduce((a,b)=>a+b,0));
  ok(`만점을 넘지 않는다 (${r.total}/${PERFECT})`, r.total<=PERFECT);
  ok('같은 입력 → 같은 점수', JSON.stringify(scoreRound(5,[100,200,300,400,500]))===JSON.stringify(r));
}
console.log('--- 이상한 값을 보내도 버틴다 ---');
ok('안 쏜 화살은 0점', scoreRound(5,[100]).shots.slice(1).every(v=>v===0));
ok('빈 배열이면 0점', scoreRound(5,[]).total===0);
ok('배열이 아니면 0점', scoreRound(5,'조작').total===0);
ok('null 이어도 안 터진다', scoreRound(5,null).total===0);
ok('숫자가 아닌 값은 0점', scoreRound(5,['많이',{},true,[],'9']).total===0);
ok('음수 시각은 0점', scoreRound(5,[-1,-999]).shots.slice(0,2).every(v=>v===0));
ok('NaN·Infinity 는 0점', scoreRound(5,[NaN,Infinity,-Infinity]).shots.slice(0,3).every(v=>v===0));
ok('화살을 더 보내도 5발만 센다', scoreRound(5,Array(50).fill(100)).shots.length===SHOTS);
{
  // 아무 시각이나 넣어도 만점이 나오면 안 된다 (게임이 안 된다)
  let perfects=0;
  for (let t=0;t<2000;t+=7) if (scoreRound(5,Array(SHOTS).fill(t)).total===PERFECT) perfects++;
  ok(`아무 때나 쏴서 만점이 나오진 않는다 (${perfects}/286)`, perfects===0);
}
{
  // 그래도 잘 맞히면 높은 점수가 가능해야 한다
  let best=0;
  for (let t=0;t<4000;t+=1) best=Math.max(best, scoreRound(5,Array(SHOTS).fill(t)).total);
  ok(`잘 맞히면 높은 점수가 난다 (최고 ${best}/${PERFECT})`, best>=PERFECT*0.5);
}

console.log(`\n실패 ${f}건`); process.exit(f?1:0);
