// 트랙 판정 검증 — 배포도 3D도 필요 없는 순수 계산.
// 실행: node --experimental-strip-types scripts/verify-track-math.mjs
//
// **판정 코드를 여기에 베껴 쓰지 않는다.** src/lib/track.ts 를 그대로 불러온다.
// 베껴 두면 화면은 고쳤는데 검증은 옛 숫자를 보는 일이 생긴다.
import {
  STRAIGHT, RADIUS, LANE_HALF, HALF_STRAIGHT, PERIMETER, CHECKPOINTS,
  offCenter, progress, pointAt, LapCounter, formatTime,
} from '../src/lib/track.ts';

let failed = 0;
const ok = (n, c, x = '') => { console.log(`${c ? '✓' : '✗'} ${n}${x ? ' — ' + x : ''}`); if (!c) failed++; };

// 1) 중심선 위의 점은 전부 offCenter 가 0 이어야 한다
let maxOff = 0;
for (let i = 0; i < 2000; i++) {
  const [x, z] = pointAt((i / 2000) * PERIMETER);
  maxOff = Math.max(maxOff, offCenter(x, z));
}
ok('중심선 위는 어디든 벗어남 0', maxOff < 1e-9, `최대 ${maxOff.toExponential(2)}`);

// 2) pointAt → progress 로 되돌리면 원래 값이 나와야 한다 (그림과 판정이 어긋나지 않는다는 뜻)
let maxErr = 0;
for (let i = 0; i < 2000; i++) {
  const s = (i / 2000) * PERIMETER;
  const [x, z] = pointAt(s);
  let d = Math.abs(progress(x, z) - s);
  d = Math.min(d, Math.abs(d - PERIMETER));
  maxErr = Math.max(maxErr, d);
}
ok('진행도가 왕복해도 같은 값', maxErr < 1e-6, `최대 오차 ${maxErr.toExponential(2)}`);

// 3) 진행도는 트랙을 따라가면 끊기지 않아야 한다 (한 곳이라도 튀면 체크포인트가 건너뛰어진다)
let maxJump = 0;
let prev = progress(...pointAt(0));
for (let i = 1; i <= 4000; i++) {
  const s = (i / 4000) * PERIMETER;
  const cur = progress(...pointAt(s));
  let d = cur - prev;
  if (d < -PERIMETER / 2) d += PERIMETER;
  maxJump = Math.max(maxJump, Math.abs(d));
  prev = cur;
}
ok('진행도가 튀지 않음', maxJump < PERIMETER / 1000 * 3, `최대 ${maxJump.toFixed(4)}`);

// 4) 안쪽으로 질러가면 확실히 선 밖이어야 한다
ok('트랙 한가운데를 가로지르면 선 밖', offCenter(0, 0) > LANE_HALF, `${offCenter(0, 0).toFixed(2)}`);
ok('곡선 안쪽으로 파고들면 선 밖', offCenter(HALF_STRAIGHT + 2, 0) > LANE_HALF, `${offCenter(HALF_STRAIGHT + 2, 0).toFixed(2)}`);

// 5) 레인 안은 통과해야 한다
ok('레인 안쪽 가장자리는 통과', offCenter(0, RADIUS - LANE_HALF + 0.05) < LANE_HALF);
ok('레인 바깥 가장자리는 통과', offCenter(0, RADIUS + LANE_HALF - 0.05) < LANE_HALF);
ok('레인을 벗어나면 탈락', offCenter(0, RADIUS + LANE_HALF + 0.1) > LANE_HALF);

// 6) 체크포인트를 순서대로 지나야 한 바퀴 (앞뒤로 왔다갔다하면 안 된다)
let lc = new LapCounter(), laps = 0;
for (let i = 0; i <= 4000; i++) {
  const [x, z] = pointAt((i / 4000) * PERIMETER);
  if (lc.update(x, z)) laps++;
}
ok('한 바퀴 돌면 딱 1바퀴로 센다', laps === 1, `${laps}바퀴`);

lc = new LapCounter(); laps = 0;
for (let i = 0; i < 600; i++) {
  const s = (Math.sin(i / 10) * 0.5 + 0.5) * (PERIMETER / CHECKPOINTS) * 0.9; // 출발선 앞 왕복
  const [x, z] = pointAt(s);
  if (lc.update(x, z)) laps++;
}
ok('출발선 앞에서 왔다갔다하면 0바퀴', laps === 0, `${laps}바퀴`);

lc = new LapCounter(); laps = 0;
for (let i = 0; i <= 4000; i++) {           // 두 바퀴
  const [x, z] = pointAt((i / 2000) * PERIMETER);
  if (lc.update(x, z)) laps++;
}
ok('두 바퀴 돌면 2바퀴', laps === 2, `${laps}바퀴`);

// 시간 표시
ok('1분 넘으면 분까지 보여줌', formatTime(72340) === '1분 12.34초', formatTime(72340));
ok('1분 안쪽은 초만', formatTime(9870) === '9.87초', formatTime(9870));
ok('음수는 0으로', formatTime(-5) === '0.00초', formatTime(-5));


// ---- 출발 지점 (2026-07-21) ----
console.log('\n--- 출발 지점은 선 뒤인가 ---');
{
  const { START_POS, progress, PERIMETER, offCenter, LANE_HALF, LapCounter, pointAt } =
    await import('../src/lib/track.ts');
  const [sx, , sz] = START_POS;
  const sp = progress(sx, sz);
  ok(`출발 지점이 출발선 뒤에 있다 (진행도 ${sp.toFixed(1)} / 둘레 ${PERIMETER.toFixed(1)})`,
     sp > PERIMETER - 5);
  ok('출발 지점이 선을 밟고 있지 않다',
     offCenter(sx, sz) < LANE_HALF - 0.3);

  // 출발 지점에서 한 바퀴를 제대로 돌면 세어지는가
  const lap = new LapCounter();
  let counted = false;
  /*
    출발선 뒤에서 시작하므로 **둘레보다 조금 더** 달려야 완주다
    (선까지 2m + 한 바퀴). 실제 경기와 같다. 딱 한 바퀴만 돌리면
    선을 못 넘고 끝나서 안 세어진다 — 처음에 이걸로 한 번 틀렸다.
  */
  for (let i = 0; i <= 400; i++) {
    const s = (PERIMETER - 2 + (i / 400) * (PERIMETER + 4)) % PERIMETER;
    const [x, z] = pointAt(s);
    if (lap.update(x, z)) { counted = true; break; }
  }
  ok('출발 지점에서 한 바퀴 돌면 세어진다', counted);

  // 뒤로 갔다 앞으로만 왔다갔다 하면 세면 안 된다
  const cheat = new LapCounter();
  let cheated = false;
  for (let i = 0; i < 200; i++) {
    const s = (PERIMETER - 2 + (i % 2) * 3) % PERIMETER;
    const [x, z] = pointAt(s);
    if (cheat.update(x, z)) { cheated = true; break; }
  }
  ok('출발선 앞뒤로만 왔다갔다 하면 안 세어진다', !cheated);
}
console.log(`\n실패 ${failed}건`);
process.exit(failed > 0 ? 1 : 0);
