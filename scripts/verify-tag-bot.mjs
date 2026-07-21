import {
  stepBot, isCaught, botSpeed, botStart, formatSurvived, CATCH_DIST, GRACE_SEC,
} from '../src/lib/tag-bot.ts';
let f=0; const ok=(n,c)=>{console.log((c?'✓':'✗')+' '+n); if(!c)f++;};
const B={half:22};

console.log('--- 로봇은 아이보다 느려야 한다 (이게 제일 중요) ---');
const KID_SPEED = 5;   // PlaygroundScene 의 아바타 속도
ok(`처음엔 훨씬 느리다 (${botSpeed(0).toFixed(1)} < ${KID_SPEED})`, botSpeed(0) < KID_SPEED);
ok(`한참 지나도 아이보다 느리다 (${botSpeed(600).toFixed(1)})`, botSpeed(600) < KID_SPEED);
ok('시간이 갈수록 빨라진다', botSpeed(30) > botSpeed(0));
ok('무한정 빨라지진 않는다', botSpeed(10000) === botSpeed(600));

console.log('--- 다가오는가 ---');
{
  let bot={x:-15,z:-15}; const kid={x:10,z:10};
  const d0=Math.hypot(bot.x-kid.x,bot.z-kid.z);
  bot=stepBot(bot,kid,0.5,0,B);
  const d1=Math.hypot(bot.x-kid.x,bot.z-kid.z);
  ok('가만히 안 있는다', d1 < d0);
  ok('한 걸음이 지나치지 않다', d0-d1 <= botSpeed(0)*0.5 + 1e-9);
}
{
  // 가만히 있는 아이는 결국 잡힌다 — 판이 끝나야 한다
  let bot={x:-18,z:-18}; const kid={x:0,z:0};
  let t=0, caught=false;
  for (let i=0;i<600;i++){ t+=0.05; bot=stepBot(bot,kid,0.05,t,B); if(isCaught(bot,kid,t)){caught=true;break;} }
  ok(`가만히 있으면 잡힌다 (${t.toFixed(1)}초)`, caught);
}
{
  // 계속 도망치면 오래 버틴다 — 게임이 성립해야 한다
  let bot={x:-18,z:-18}; let kid={x:0,z:0};
  let t=0, caught=false;
  for (let i=0;i<400;i++){
    t+=0.05;
    // 아이가 로봇 반대쪽으로 달린다 (테두리 안에서)
    const dx=kid.x-bot.x, dz=kid.z-bot.z, d=Math.hypot(dx,dz)||1;
    kid={ x: Math.max(-20,Math.min(20, kid.x+(dx/d)*KID_SPEED*0.05)),
          z: Math.max(-20,Math.min(20, kid.z+(dz/d)*KID_SPEED*0.05)) };
    bot=stepBot(bot,kid,0.05,t,B);
    if(isCaught(bot,kid,t)){caught=true;break;}
  }
  ok(`잘 도망치면 10초는 버틴다 (${t.toFixed(1)}초)`, !caught || t > 10);
}

console.log('--- 운동장 밖으로 안 나간다 ---');
{
  let bot={x:0,z:0};
  for (let i=0;i<200;i++) bot=stepBot(bot,{x:999,z:999},0.5,100,B);
  ok('테두리 안에 머문다', Math.abs(bot.x)<=B.half+1e-9 && Math.abs(bot.z)<=B.half+1e-9);
}

console.log('--- 시작하자마자 잡히지 않는다 ---');
ok('붙어 있어도 처음엔 안 잡힌다', !isCaught({x:0,z:0},{x:0,z:0},0));
ok(`${GRACE_SEC}초 지나면 잡힌다`, isCaught({x:0,z:0},{x:0,z:0},GRACE_SEC+0.1));
ok('멀면 안 잡힌다', !isCaught({x:0,z:0},{x:5,z:5},99));
ok(`딱 ${CATCH_DIST}m 면 잡힌다`, isCaught({x:0,z:0},{x:CATCH_DIST,z:0},99));

console.log('--- 로봇은 멀리서 시작한다 ---');
{
  for (const kid of [{x:10,z:10},{x:-10,z:10},{x:0,z:0},{x:-3,z:8}]) {
    const b=botStart(kid,B);
    const d=Math.hypot(b.x-kid.x,b.z-kid.z);
    ok(`(${kid.x},${kid.z}) 에서 멀리 선다 (${d.toFixed(1)}m)`, d > B.half);
    ok('테두리 안이다', Math.abs(b.x)<=B.half && Math.abs(b.z)<=B.half);
  }
}

console.log('--- 이상한 값 ---');
ok('dt 0 이면 안 움직인다',
   JSON.stringify(stepBot({x:1,z:1},{x:5,z:5},0,10,B))===JSON.stringify({x:1,z:1}));
ok('dt 음수여도 안 터진다', !!stepBot({x:1,z:1},{x:5,z:5},-1,10,B));
ok('같은 자리면 안 떤다',
   JSON.stringify(stepBot({x:2,z:2},{x:2,z:2},0.1,10,B))===JSON.stringify({x:2,z:2}));

console.log('--- 시간 표시 ---');
ok('12.3초', formatSurvived(12345)==='12.3초');
ok('음수는 0', formatSurvived(-5)==='0.0초');

console.log(`\n실패 ${f}건`); process.exit(f?1:0);
