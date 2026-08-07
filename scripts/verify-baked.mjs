import { SUN, lightRGB, shadowFactor, shadeRGB, hexToRGB } from '../src/lib/baked.ts';
let f = 0; const ok = (n, c) => { console.log((c ? '✓' : '✗') + ' ' + n); if (!c) f++; };
const lum = (c) => (c[0] + c[1] + c[2]) / 3;

console.log('--- 빛 (lightRGB) ---');
ok('SUN 은 단위벡터다', Math.abs(Math.hypot(SUN.x, SUN.y, SUN.z) - 1) < 1e-9);
const up = lightRGB(0, 1, 0), down = lightRGB(0, -1, 0);
const toSun = lightRGB(SUN.x, SUN.y, SUN.z);
const away = lightRGB(-SUN.x, -SUN.y, -SUN.z);
// 옆면 그늘 — 수평으로 해를 등진 면. 바운스(아래 면)와 섞이지 않는 순수한 그늘이다.
const sideL = Math.hypot(SUN.x, SUN.z);
const side = lightRGB(-SUN.x / sideL, 0, -SUN.z / sideL);
ok('해를 보는 면이 어느 면보다 어둡지 않다', lum(toSun) >= lum(up) && lum(toSun) > lum(away));
ok('위를 보는 면이 아래를 보는 면보다 밝다', lum(up) > lum(down));
ok('해 드는 면은 따뜻하다 (R≥B)', toSun[0] >= toSun[2]);
ok('옆면 그늘은 차갑다 (B>R)', side[2] > side[0]);
ok('아래로 기운 그늘은 바운스가 데운다 (R>B)', away[0] > away[2]);
ok('아래 면엔 바닥 반사광이 스민다 (R>B)', down[0] > down[2]);
ok('빛은 날아가지 않는다 (최대 1.2 근처)', [up, down, toSun, away].every((c) => Math.max(...c) < 1.35));
ok('빛은 죽지 않는다 (최소 0.2 이상)', [up, down, toSun, away].every((c) => Math.min(...c) > 0.2));

console.log('--- 그림자 (shadowFactor) ---');
const occ = [{ x: 0, z: 0, r: 3, k: 0.5 }];
const at = (x, z) => shadowFactor(occ, x, z);
ok('가리개가 없으면 1', shadowFactor([], 5, 5) === 1);
ok('가리개 근처가 먼 곳보다 어둡다', at(0, 0) < at(30, 30));
ok('멀리서는 1로 돌아간다', Math.abs(at(60, 0) - 1) < 1e-6);
ok('아무리 겹쳐도 0.45 밑으로 안 간다',
  shadowFactor(Array.from({ length: 30 }, () => ({ x: 0, z: 0, r: 4, k: 0.9 })), 0, 0) === 0.45);
// 그림자는 해 반대쪽으로 밀린다 — 해 반대쪽 지점이 해 쪽 지점보다 어둡다
const sl = Math.hypot(SUN.x, SUN.z);
const sx = SUN.x / sl, sz = SUN.z / sl;
ok('해 반대쪽이 해 쪽보다 어둡다', at(-sx * 2.5, -sz * 2.5) < at(sx * 2.5, sz * 2.5));

console.log('--- 그림자 색 (shadeRGB) ---');
const base = [0.6, 0.6, 0.6];
const shaded = shadeRGB(base, 0.6);
ok('어두워진다', lum(shaded) < lum(base));
ok('푸르게 기운다 (B 비중 증가)', shaded[2] / lum(shaded) > base[2] / lum(base));
ok('그림자 1이면 색이 안 변한다', shadeRGB(base, 1).every((v, i) => Math.abs(v - base[i]) < 1e-9));

console.log('--- hexToRGB ---');
ok('흰색', hexToRGB(0xFFFFFF).every((v) => v === 1));
ok('빨강', hexToRGB(0xFF0000).join(',') === '1,0,0');

if (f) { console.log(`\n${f}건 실패`); process.exit(1); }
console.log('\n전부 통과');
