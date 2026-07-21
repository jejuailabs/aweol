import {
  wallSlots, overflowCount, CAPACITY, PER_ROW, FRAME_OUTER, ROOM_W, ROOM_D,
} from '../src/lib/exhibit-layout.ts';
let f=0; const ok=(n,c)=>{console.log((c?'✓':'✗')+' '+n); if(!c)f++;};

console.log('--- 한 반 30명이 다 걸리는가 (이게 목적) ---');
ok(`전시실 하나에 ${CAPACITY}점 (30 이상)`, CAPACITY >= 30);
ok('30점이면 남는 게 없다', overflowCount(30) === 0);
ok(`30점을 넣으면 자리도 30개 이상 (${wallSlots(30).length})`, wallSlots(30).length >= 30);

console.log('--- 자리가 서로 겹치지 않는가 ---');
for (const n of [1, 5, 10, 16, 17, 24, 30, 40]) {
  const s = wallSlots(n);
  let clash = 0;
  for (let i = 0; i < s.length; i++)
    for (let j = i + 1; j < s.length; j++) {
      const [ax, ay, az] = s[i].pos, [bx, by, bz] = s[j].pos;
      // 같은 벽·같은 줄에 있는 것끼리만 견준다
      const sameWall = s[i].rot[1] === s[j].rot[1]
        && Math.abs(ax - bx) + Math.abs(az - bz) < 20
        && (s[i].rot[1] === 0 ? Math.abs(az - bz) < 0.1 : Math.abs(ax - bx) < 0.1);
      if (!sameWall) continue;
      if (Math.abs(ay - by) > 0.1) continue;
      const along = s[i].rot[1] === 0 ? Math.abs(ax - bx) : Math.abs(az - bz);
      if (along < FRAME_OUTER) clash++;
    }
  ok(`${n}점 배치에서 겹치는 자리 없음`, clash === 0);
}

console.log('--- 벽을 넘지 않는가 ---');
{
  const s = wallSlots(30);
  const half = FRAME_OUTER / 2;
  ok('가로로 벽 밖을 안 넘는다', s.every(({pos,rot}) =>
    rot[1] === 0
      ? Math.abs(pos[0]) + half <= ROOM_W / 2
      : Math.abs(pos[2]) + half <= ROOM_D / 2));
  ok('바닥 장식(0.8) 위에 걸린다', s.every(({pos}) => pos[1] - 0.675 > 0.8));
  ok('천장(5) 아래 걸린다', s.every(({pos}) => pos[1] + 0.675 < 5));
}

console.log('--- 적으면 한 줄, 많으면 두 줄 ---');
{
  const ys = (n) => [...new Set(wallSlots(n).map(s => s.pos[1]))];
  ok('5점이면 한 줄', ys(5).length === 1);
  ok(`${PER_ROW}점이면 아직 한 줄`, ys(PER_ROW).length === 1);
  ok(`${PER_ROW + 1}점이면 두 줄`, ys(PER_ROW + 1).length === 2);
  ok('한 줄일 땐 눈높이(2.5)', ys(5)[0] === 2.5);
}

console.log('--- 넘치면 알려줄 수 있는가 ---');
ok('30점은 안 넘친다', overflowCount(30) === 0);
ok(`${CAPACITY + 5}점이면 5점이 넘친다`, overflowCount(CAPACITY + 5) === 5);
ok('0점이면 0', overflowCount(0) === 0);
ok('음수여도 0', overflowCount(-3) === 0);

console.log('--- 뒷벽부터 채우는가 (가장 잘 보이는 자리) ---');
{
  const s = wallSlots(30);
  ok('첫 자리는 뒷벽', s[0].rot[1] === 0);
  const firstSide = s.findIndex(x => x.rot[1] !== 0);
  ok('뒷벽을 다 채우고 옆으로 간다', firstSide === 6);
}

console.log(`\n한 줄 ${PER_ROW}자리 · 전시실 ${CAPACITY}자리 · 실패 ${f}건`);
process.exit(f?1:0);
