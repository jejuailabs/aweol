/**
 * 화면 비율별로 **가로로 얼마나 보이나.**
 *
 * `fov` 는 세로 기준이라, 세로로 긴 폰에서는 가로 시야가 통째로 줄어든다.
 * "모바일에서는 몹이 안 보인다" 가 이것인지 숫자로 재본다.
 *
 * 실행: node scripts/verify-fov.mjs
 */

const H_FOV_TARGET = 76;
const V_FOV_MIN = 52;
const V_FOV_MAX = 74;
const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

const fovFor = (aspect) => {
  const half = Math.atan(Math.tan((H_FOV_TARGET / 2) * D2R) / aspect);
  return Math.max(V_FOV_MIN, Math.min(V_FOV_MAX, half * 2 * R2D));
};

/** 세로 fov 와 비율에서 가로 시야를 낸다 */
const hFov = (vFov, aspect) =>
  2 * Math.atan(Math.tan((vFov / 2) * D2R) * aspect) * R2D;

/** 그 시야로 앞쪽 `dist` 미터 지점에서 가로로 몇 미터가 담기나 */
const widthAt = (h, dist) => 2 * dist * Math.tan((h / 2) * D2R);

const SCREENS = [
  ['PC 1280x720', 1280, 720],
  ['노트북 1440x900', 1440, 900],
  ['태블릿 세로 768x1024', 768, 1024],
  ['폰 390x844 (아이폰)', 390, 844],
  ['폰 360x800 (갤럭시)', 360, 800],
  ['폰 가로 844x390', 844, 390],
];

console.log('세로 fov 를 58 로 못박았을 때 vs 비율에 맞췄을 때\n');
console.log('화면'.padEnd(24), '가로시야(전)'.padEnd(14), '가로시야(후)'.padEnd(14), '40m 앞 담기는 폭');
console.log('-'.repeat(78));

let worstBefore = 999;
let worstAfter = 999;

for (const [name, w, h] of SCREENS) {
  const a = w / h;
  const before = hFov(58, a);
  const v = fovFor(a);
  const after = hFov(v, a);
  worstBefore = Math.min(worstBefore, before);
  worstAfter = Math.min(worstAfter, after);
  console.log(
    name.padEnd(24),
    `${before.toFixed(0)}°`.padEnd(14),
    `${after.toFixed(0)}° (세로 ${v.toFixed(0)}°)`.padEnd(14),
    `${widthAt(before, 40).toFixed(0)}m → ${widthAt(after, 40).toFixed(0)}m`
  );
}

console.log('\n가장 좁은 화면 기준: ' + `${worstBefore.toFixed(0)}° → ${worstAfter.toFixed(0)}°`
  + ` (${(worstAfter / worstBefore).toFixed(1)}배 넓어진다)`);

// 몹 간격(12~38m)과 견줘 본다
console.log('\n몹은 서로 12~38m 떨어져 있다. 40m 앞에서 담기는 폭이');
console.log('그보다 좁으면 걷는 내내 한 마리도 화면에 안 들어올 수 있다.');
