import {
  heightAt, slopeAt, summit, PATH, PLAZA, OREUM, STAGE_HALF, SILVERGRASS_MIN_H,
} from '../src/lib/terrain.ts';
let f = 0; const ok = (n, c) => { console.log((c ? '✓' : '✗') + ' ' + n); if (!c) f++;};

console.log('--- 마당은 평평하다 ---');
let plazaMax = 0;
for (let a = 0; a < 24; a++) {
  for (let rr = 0; rr <= PLAZA.r * 0.7; rr += 3) {
    const h = Math.abs(heightAt(PLAZA.x + Math.cos(a) * rr, PLAZA.z + Math.sin(a) * rr));
    plazaMax = Math.max(plazaMax, h);
  }
}
ok(`마당 안쪽(반경 70%)의 높이차 ${plazaMax.toFixed(2)}m < 0.3m`, plazaMax < 0.3);

console.log('--- 오름은 오른다 ---');
const top = summit();
ok(`정상이 ${OREUM.h * 0.8}m 보다 높다 (실제 ${top.h.toFixed(1)}m)`, top.h > OREUM.h * 0.8);
ok('정상은 무대 안에 있다',
  Math.abs(top.x) < STAGE_HALF && Math.abs(top.z) < STAGE_HALF);
ok('마당에서 정상으로 갈수록 높아진다 (중간 지점이 마당보다 높다)',
  heightAt((PLAZA.x + top.x) / 2, (PLAZA.z + top.z) / 2) > 1);
ok(`정상 높이에서는 억새가 자란다 (${SILVERGRASS_MIN_H}m 기준)`, top.h > SILVERGRASS_MIN_H);

console.log('--- 길은 걸을 수 있다 ---');
// 길 조각들을 촘촘히 밟아 경사를 잰다. 최대 경사가 걷기 불가능하면 안 된다.
let worst = 0;
for (let i = 0; i < PATH.length - 1; i++) {
  const [x0, z0] = PATH[i];
  const [x1, z1] = PATH[i + 1];
  for (let t = 0; t <= 1; t += 0.1) {
    worst = Math.max(worst, slopeAt(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t));
  }
}
ok(`길 위 최대 경사 ${worst.toFixed(2)} < 0.85 (약 40도)`, worst < 0.85);
ok('길의 시작은 마당 안이다',
  Math.hypot(PATH[0][0] - PLAZA.x, PATH[0][1] - PLAZA.z) < PLAZA.r);
const [ex, ez] = PATH[PATH.length - 1];
ok(`길의 끝은 억새밭에 닿는다 (높이 ${heightAt(ex, ez).toFixed(1)}m)`,
  heightAt(ex, ez) > SILVERGRASS_MIN_H * 0.75);
ok('길은 전부 무대 안에 있다',
  PATH.every(([x, z]) => Math.abs(x) < STAGE_HALF && Math.abs(z) < STAGE_HALF));

console.log('--- 무대 가장자리 ---');
// 경계에 절벽이 서 있으면 안 된다 — 가장자리는 들판 잔굴곡 수준이어야 한다
let edgeMax = 0;
for (let t = -STAGE_HALF; t <= STAGE_HALF; t += 4) {
  for (const [x, z] of [[t, STAGE_HALF], [t, -STAGE_HALF], [STAGE_HALF, t], [-STAGE_HALF, t]]) {
    edgeMax = Math.max(edgeMax, Math.abs(heightAt(x, z)));
  }
}
ok(`가장자리 최대 높이 ${edgeMax.toFixed(1)}m < 4m`, edgeMax < 4);

if (f) { console.log(`\n${f}건 실패`); process.exit(1); }
console.log('\n전부 통과');
