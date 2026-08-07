import {
  project, insideCoast, coastDistance, islandHeight, PLACES, COAST_KM, HALLASAN,
} from '../src/lib/jeju-map.ts';
let f = 0; const ok = (n, c) => { console.log((c ? '✓' : '✗') + ' ' + n); if (!c) f++; };

console.log('--- 섬 모양 ---');
const xs = COAST_KM.map((p) => p[0]);
const zs = COAST_KM.map((p) => p[1]);
const w = Math.max(...xs) - Math.min(...xs);
const h = Math.max(...zs) - Math.min(...zs);
ok(`동서 ${w.toFixed(0)}km — 실제(약 73km)와 비슷하다`, w > 60 && w < 90);
ok(`남북 ${h.toFixed(0)}km — 실제(약 31km)와 비슷하다`, h > 25 && h < 45);
ok('섬이 남북보다 동서로 길다 (제주도답다)', w / h > 1.8 && w / h < 3);

console.log('--- 장소가 전부 땅 위에 있다 ---');
for (const p of PLACES) {
  const { x, z } = project(p.lng, p.lat);
  ok(`${p.name} 은 섬 안에 있다`, insideCoast(x, z));
}

console.log('--- 방위가 맞다 ---');
const aewol = project(126.3312, 33.4626);
const seongsan = project(126.92, 33.459);
const seogwipo = project(126.56, 33.253);
const halla = project(HALLASAN.lng, HALLASAN.lat);
ok('애월은 서북쪽이다 (x<0, z<0)', aewol.x < 0 && aewol.z < 0);
ok('성산은 동쪽 끝이다', seongsan.x > 30);
ok('서귀포는 남쪽이다 (z>0)', seogwipo.z > 10);
ok('한라산은 가운데쯤이다', Math.abs(halla.x) < 5 && Math.abs(halla.z) < 5);

console.log('--- 실거리 검산 ---');
const jejusi = project(126.5312, 33.4996);
const dAJ = Math.hypot(aewol.x - jejusi.x, aewol.z - jejusi.z);
ok(`애월↔제주시 직선 ${dAJ.toFixed(1)}km (실제 약 19km)`, dAJ > 14 && dAJ < 24);
const dAH = Math.hypot(aewol.x - project(126.305, 33.4655).x, aewol.z - project(126.305, 33.4655).z);
ok(`애월↔한담 직선 ${dAH.toFixed(1)}km (걸어갈 거리)`, dAH < 4);

console.log('--- 땅 높이 ---');
ok('바다는 평평하고 낮다', islandHeight(0, 40) === -0.35 && islandHeight(-50, 0) === -0.35);
ok(`한라산 자리가 제일 높다 (${islandHeight(halla.x, halla.z).toFixed(1)})`,
  islandHeight(halla.x, halla.z) > 5);
ok('해안 마을은 낮다 (애월 < 1.5)', islandHeight(aewol.x, aewol.z) < 1.5);
ok('해안선 바로 안쪽은 얕은 턱이다', islandHeight(aewol.x, aewol.z) > 0);
ok('coastDistance: 한라산은 깊숙히 안쪽 (10km 넘게)', coastDistance(halla.x, halla.z) > 10);
ok('coastDistance: 먼 바다는 음수', coastDistance(0, 50) < -5);

console.log('--- 열림/예정 ---');
const open = PLACES.filter((p) => p.status === 'open');
ok('열린 곳은 애월·한담·곽지·오름 넷이다',
  open.length === 4 && open.every((p) => ['aewol', 'handam', 'gwakji', 'oreum'].includes(p.id)));
ok('열린 곳은 전부 갈 길이 있다', open.every((p) => !!p.route));
ok('예정인 곳은 갈 길이 없다', PLACES.filter((p) => p.status === 'soon').every((p) => !p.route));

if (f) { console.log(`\n${f}건 실패`); process.exit(1); }
console.log('\n전부 통과');
