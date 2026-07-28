/**
 * 전시관 양식이 **정말 다른가.**
 *
 * 예전에는 셋 다 같은 건물에 색만 달랐다. 이제 건물·마당·조형물까지
 * 바꿨는데, 표를 늘리다 보면 **색만 다른 것이 다시 섞여 들어온다.**
 * 여기서 숫자로 못을 박는다.
 *
 * 실행: node --experimental-strip-types scripts/verify-hall-themes.mjs
 */
import { HALL_THEMES, themeOf } from '../src/lib/art-hall.ts';

let pass = 0;
const fails = [];
const ok = (name, cond) => { if (cond) pass++; else fails.push(name); };

const all = Object.values(HALL_THEMES);

ok(`다섯 가지다 (${all.length})`, all.length === 5);

// ---- 저마다 다른 건물·마당이어야 한다 ----
const arches = new Set(all.map((t) => t.arch));
const pavings = new Set(all.map((t) => t.paving));
ok(`건물 모양이 다 다르다 (${arches.size}/${all.length})`, arches.size === all.length);
ok(`마당 무늬가 다 다르다 (${pavings.size}/${all.length})`, pavings.size === all.length);

// ---- 예전 전시관이 안 깨져야 한다 ----
for (const old of ['white', 'dark', 'wood']) {
  ok(`예전 이름 '${old}' 가 그대로 산다`, themeOf(old).id === old);
}
ok('모르는 값은 기본으로 떨어진다', themeOf('없는값').id === 'white');
ok('빈 값도 기본으로 떨어진다', themeOf(undefined).id === 'white');

// ---- 표가 비어 있으면 안 된다 ----
const HEX = /^#[0-9A-Fa-f]{6}$/;
for (const t of all) {
  ok(`${t.id}: 무엇을 본떴는지 적혀 있다`, (t.motif ?? '').length >= 8);
  ok(`${t.id}: 이름이 있다`, (t.label ?? '').length >= 2);
  for (const key of ['facade', 'plazaBase', 'plazaTile', 'plazaLine', 'accent',
    'wall', 'floor', 'ceiling', 'trim', 'frame', 'caption']) {
    ok(`${t.id}.${key} 가 색이다`, HEX.test(t[key]));
  }
  ok(`${t.id}: 하늘이 그라디언트다`, String(t.sky).startsWith('linear-gradient'));
  ok(`${t.id}: 밝기가 0~1`, t.ambient > 0 && t.ambient <= 1);

  /*
    **마당과 건물이 같은 색이면 건물이 땅에 묻힌다.**
    눈으로 보기 전에 여기서 걸러낸다.
  */
  ok(`${t.id}: 건물과 마당이 구별된다`, t.facade.toLowerCase() !== t.plazaTile.toLowerCase());
  ok(`${t.id}: 마당 줄눈이 바닥과 다르다`, t.plazaLine.toLowerCase() !== t.plazaTile.toLowerCase());
}

console.log('양식'.padEnd(14), '건물'.padEnd(12), '마당'.padEnd(10), '나무', ' 본뜬 것');
console.log('-'.repeat(76));
for (const t of all) {
  console.log(
    t.label.padEnd(15),
    t.arch.padEnd(12),
    t.paving.padEnd(11),
    (t.trees ? '있음' : '없음').padEnd(5),
    t.motif.slice(0, 30)
  );
}

console.log(fails.length === 0 ? `\n✅ ${pass}개 통과` : `\n❌ ${fails.length}개 실패 (${pass}개 통과)`);
for (const f of fails) console.log('   -', f);
process.exit(fails.length === 0 ? 0 : 1);
