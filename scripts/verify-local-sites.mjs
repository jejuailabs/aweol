/**
 * 우리 고장 유적 검증.
 *
 * **여기서 지키는 것은 코드가 아니라 사실이다.**
 * 아이가 자기 고장 역사로 외우는 내용이라, 함수가 도는지보다
 * **글이 규칙을 지키는지**가 더 중요하다:
 *
 * - 출처가 있는가 (없으면 지어낸 것이다)
 * - 자료마다 갈리는 숫자를 쓰지 않았는가 (둘레 549척/255보, 높이 8척/16척)
 * - 심부름이 **실제로 있는 유적**으로 보내는가
 *
 * 실행: node --experimental-strip-types scripts/verify-local-sites.mjs
 */
import { LOCAL_SITES, sitesOfSchool, siteById } from '../src/lib/local-sites.ts';
import { CIVIC_PLACES } from '../src/lib/civic-places.ts';

let pass = 0;
const fails = [];
const ok = (name, cond) => (cond ? pass++ : fails.push(name));

// ── 표 자체 ──────────────────────────────────────────────
ok('유적이 하나 이상 있다', LOCAL_SITES.length >= 1);
ok('id 가 겹치지 않는다', new Set(LOCAL_SITES.map((s) => s.id)).size === LOCAL_SITES.length);

for (const s of LOCAL_SITES) {
  ok(`${s.id}: 이름이 있다`, !!s.name);
  ok(`${s.id}: 어느 학교 것인지 적혀 있다`, s.schoolIds.length >= 1);
  ok(`${s.id}: 한 줄 소개가 있다`, s.oneLine.length >= 10);
  ok(`${s.id}: 읽을 장이 3장 이상`, s.pages.length >= 3);
  ok(`${s.id}: 출처가 있다`, s.sources.length >= 1);
  ok(
    `${s.id}: 출처가 진짜 주소다`,
    s.sources.every((x) => /^https?:\/\/.+\..+/.test(x.url) && !!x.label)
  );

  // 좌표는 학교(원점) 둘레 안이어야 한다. 마을 반경이 400m 다.
  ok(`${s.id}: 좌표가 마을 안이다`, Math.hypot(s.x, s.z) < 400);

  for (const p of s.pages) {
    ok(`${s.id}/${p.title}: 제목이 있다`, p.title.length >= 2);
    ok(`${s.id}/${p.title}: 내용이 있다`, p.body.length >= 20);
    // 강조 별표는 짝이 맞아야 한다 — 안 맞으면 화면에 별표가 그대로 보인다
    ok(
      `${s.id}/${p.title}: ** 짝이 맞는다`,
      (p.body.match(/\*\*/g) ?? []).length % 2 === 0
    );
  }

  /**
   * **자료가 갈리는 숫자를 안 쓴다.**
   * 애월진성은 둘레와 높이가 자료마다 다르게 적혀 있어 아예 뺐다.
   * 옛 단위(척·보)가 다시 들어오면 여기서 걸린다.
   */
  const all = s.pages.map((p) => p.body).join('\n');
  ok(`${s.id}: 척/보 같은 갈리는 숫자를 안 썼다`, !/\d+\s*(척|보)\b/.test(all));
}

// ── 이 학교 것만 뜬다 ────────────────────────────────────
ok('애월초에 애월진성이 뜬다', sitesOfSchool('aewol-elementary').some((s) => s.id === 'aewol-jinseong'));
ok('다른 학교에는 안 뜬다', sitesOfSchool('some-other-school').length === 0);
ok('빈 학교 id 에도 안 뜬다', sitesOfSchool('').length === 0);
ok('id 로 찾는다', siteById('aewol-jinseong')?.name === '애월진성');
ok('없는 id 는 undefined', siteById('nope') === undefined);

// ── 심부름이 실제로 있는 곳으로 보내는가 ─────────────────
/**
 * **막다른 심부름을 막는다.** 읍사무소가 없는 유적으로 보내면
 * 아이는 마을을 헤매다 못 끝낸다.
 */
for (const p of CIVIC_PLACES) {
  if (!p.mission) continue;
  const m = p.mission;
  ok(`${p.kind}: 심부름이 있는 유적으로 보낸다`, !!siteById(m.siteId));
  ok(`${p.kind}: 심부름 주는 사람이 실제로 있다`, !!p.people[m.at]);
  ok(`${p.kind}: 시키는 말과 상 주는 말이 다르다`, m.ask !== m.reward && m.ask.length > 10 && m.reward.length > 10);
  ok(
    `${p.kind}: 심부름 ** 짝이 맞는다`,
    (m.ask.match(/\*\*/g) ?? []).length % 2 === 0 && (m.reward.match(/\*\*/g) ?? []).length % 2 === 0
  );
  // 이야기꾼과 심부름꾼이 같으면 느낌표 하나에 두 가지가 걸린다
  ok(`${p.kind}: 이야기꾼과 심부름꾼이 다른 사람이다`, p.guideAt !== m.at);
}

console.log(fails.length === 0 ? `✅ ${pass}개 통과` : `❌ ${fails.length}개 실패 (${pass}개 통과)`);
fails.forEach((f) => console.log('   -', f));
process.exit(fails.length === 0 ? 0 : 1);
