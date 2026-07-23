/**
 * 우리 동네 기관 알아보기 검증.
 *
 * **판정 코드를 베껴 쓰지 않는다** — `src/lib/civic-places.ts` 를 그대로 불러온다.
 *
 * 여기서 제일 중요한 것은 **아무거나 갖다 붙이지 않는가** 다.
 * 은행을 우체국이라고 알려주면 안 배우느니만 못하다.
 *
 * 실행: node --experimental-strip-types scripts/verify-civic-places.mjs
 */
import { CIVIC_PLACES, civicByKind, civicKindOf } from '../src/lib/civic-places.ts';

let failed = 0;
const ok = (n, c, extra = '') => {
  console.log(`${c ? '✓' : '✗'} ${n}${extra ? ' — ' + extra : ''}`);
  if (!c) failed++;
};

console.log('[태그로 알아보기]');
ok('amenity=townhall → 읍사무소', civicKindOf({ k: 'townhall' }) === 'townhall');
ok('amenity=post_office → 우체국', civicKindOf({ k: 'post_office' }) === 'post_office');
ok('모르는 태그는 null', civicKindOf({ k: 'cafe' }) === null, String(civicKindOf({ k: 'cafe' })));

console.log('\n[이름으로 알아보기 — 한국 OSM 은 태그가 성기다]');
/**
 * 실제로 애월초 마을에는 '애월읍사무소' 가 **건물 이름으로만** 들어와 있다.
 * 태그만 믿으면 눈앞의 읍사무소를 못 알아본다.
 */
ok('애월읍사무소 → 읍사무소', civicKindOf({ n: '애월읍사무소' }) === 'townhall');
ok('제주우체국 → 우체국', civicKindOf({ n: '제주우체국' }) === 'post_office');
ok('애월파출소 → 경찰', civicKindOf({ n: '애월파출소' }) === 'police');
ok('한림지구대 → 경찰', civicKindOf({ n: '한림지구대' }) === 'police');
ok('애월도서관 → 도서관', civicKindOf({ n: '애월도서관' }) === 'library');
ok('행정복지센터 → 읍사무소', civicKindOf({ n: '노형동행정복지센터' }) === 'townhall');
ok('띄어 써도 알아본다', civicKindOf({ n: '애월 읍 사무소' }) === 'townhall');

console.log('\n[아무거나 갖다 붙이지 않는다 — 이게 제일 중요하다]');
for (const name of ['제주은행', '오일뱅크 주유소', '애월체육관', '한담해변', '우리집', '']) {
  ok(`'${name || '(이름 없음)'}' 은 기관이 아니다`, civicKindOf({ n: name }) === null,
    String(civicKindOf({ n: name })));
}
// 은행은 마을 데이터에 실제로 있다. 우체국과 헷갈리면 안 된다.
ok('은행 태그도 기관이 아니다 (아직 안 만들었다)', civicKindOf({ k: 'bank' }) === null);

console.log('\n[태그가 이름을 이긴다]');
ok('태그가 있으면 태그를 쓴다',
  civicKindOf({ k: 'post_office', n: '애월읍사무소' }) === 'post_office');

console.log('\n[표가 성한가 — 빠진 칸이 있으면 화면이 빈다]');
for (const p of CIVIC_PLACES) {
  const full = !!p.label && !!p.emoji && !!p.oneLine
    && p.people.length > 0 && p.people.every((x) => x.name && x.job && x.emoji)
    && p.todo.length > 0;
  ok(`${p.emoji} ${p.label} 이 다 채워져 있다`, full);
  ok(`  ${p.label} 은 kind 로 찾아진다`, civicByKind(p.kind) === p);
}

console.log(`\n실패 ${failed}건`);
process.exit(failed > 0 ? 1 : 0);
