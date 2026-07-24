/**
 * 우리 마을 조사대 — 심부름 그래프 검증.
 *
 * **여기서 막는 것은 버그가 아니라 막다른 길이다.**
 * 없는 곳으로 보내는 심부름, 없는 사람이 주는 심부름, 앞이 끊긴 심부름.
 * 하나라도 있으면 아이는 마을에서 헤매다 그만둔다.
 *
 * 실행: node --experimental-strip-types scripts/verify-village-rpg.mjs
 */
import {
  QUESTS, CHAPTERS, RANKS,
  questState, questsAtPlace, questOfPerson, openQuests, doneQuests,
  badgesOf, chapterProgress, questTarget, rankOf, toNextRank,
  siteKey, placeKey, questKey,
} from '../src/lib/village-rpg.ts';
import { CIVIC_PLACES, civicByKind } from '../src/lib/civic-places.ts';
import {
  LOCAL_SITES, sitesOfSchool, siteById, walkableSites, timelineOf,
  siteXZ, howFar, DIR_LABEL, WALKABLE_KM,
} from '../src/lib/local-sites.ts';
import { checkRpg, defaultsFor, errorsOf } from '../src/lib/rpg-content.ts';

let pass = 0;
const fails = [];
const ok = (n, c) => (c ? pass++ : fails.push(n));

const SCHOOL = 'aewol-elementary';

// ── 유적 표 ──────────────────────────────────────────────
ok('유적이 넉넉히 있다', LOCAL_SITES.length >= 8);
ok('id 가 겹치지 않는다', new Set(LOCAL_SITES.map((s) => s.id)).size === LOCAL_SITES.length);

for (const s of LOCAL_SITES) {
  const tag = s.id;
  ok(`${tag}: 이름이 있다`, !!s.name);
  ok(`${tag}: 어느 학교 것인지 적혀 있다`, s.schoolIds.length >= 1);
  ok(`${tag}: 한 줄 소개가 있다`, s.oneLine.length >= 10);
  ok(`${tag}: 읽을 장이 4장 이상`, s.pages.length >= 4);
  ok(`${tag}: 출처가 두 곳 이상`, s.sources.length >= 2);
  ok(`${tag}: 출처가 진짜 주소다`, s.sources.every((x) => /^https?:\/\/.+\..+/.test(x.url) && !!x.label));
  ok(`${tag}: 낱말이 세 개 이상`, s.keywords.length >= 3);
  ok(`${tag}: 방위가 8방위 안에 있다`, !!DIR_LABEL[s.dir]);
  ok(`${tag}: 거리가 읍 안이다`, s.km >= 0 && s.km <= 30);
  ok(`${tag}: 못 가는 곳이면 왜인지 적혀 있다`, s.open || !!s.closedWhy);

  for (const p of s.pages) {
    ok(`${tag}/${p.title}: 제목이 있다`, p.title.length >= 2);
    ok(`${tag}/${p.title}: 내용이 있다`, p.body.length >= 20);
    ok(`${tag}/${p.title}: ** 짝이 맞는다`, (p.body.match(/\*\*/g) ?? []).length % 2 === 0);
  }

  /**
   * **자료가 갈리는 숫자를 안 쓴다.**
   * 애월진성 둘레(549척/255보)처럼 옛 단위로 적힌 것은 자료마다 다르다.
   */
  const all = s.pages.map((p) => p.body).join('\n');
  ok(`${tag}: 척/보 같은 갈리는 단위를 안 썼다`, !/\d+\s*(척|보)\b/.test(all));
}

// 연표는 시대가 겹치지 않고 차례가 있어야 한다
const tl = timelineOf(SCHOOL);
ok('연표에 네 칸 이상 있다', tl.length >= 4);
ok('연표 차례가 겹치지 않는다', new Set(tl.map((s) => s.era.order)).size === tl.length);
ok('연표가 옛날부터 차례로 나온다', tl.every((s, i) => i === 0 || tl[i - 1].era.order < s.era.order));

// 걸어갈 수 있는 곳과 아닌 곳
const walk = walkableSites(SCHOOL);
ok('걸어갈 수 있는 곳이 있다', walk.length >= 1);
ok('걸어갈 수 있는 곳은 다 가깝다', walk.every((s) => s.km <= WALKABLE_KM));
ok('애월진성은 걸어갈 수 있다', walk.some((s) => s.id === 'aewol-jinseong'));
ok('항파두리는 걸어갈 수 없다', !walk.some((s) => s.id === 'hangpaduri'));

// 읍 지도 좌표
for (const s of sitesOfSchool(SCHOOL)) {
  const { x, z } = siteXZ(s);
  ok(`${s.id}: 지도 좌표가 거리와 맞는다`, Math.abs(Math.hypot(x, z) - s.km) < 0.01);
}
ok('북쪽은 위로 간다', siteXZ({ dir: 'N', km: 5 }).z < 0);
ok('동쪽은 오른쪽으로 간다', siteXZ({ dir: 'E', km: 5 }).x > 0);
ok('학교 안은 거리 표시가 다르다', howFar({ dir: 'N', km: 0 }).includes('학교'));
ok('먼 곳은 방위와 거리를 말해준다', howFar({ dir: 'SE', km: 4 }).includes('남동') && howFar({ dir: 'SE', km: 4 }).includes('4km'));

ok('학교로 걸러진다', sitesOfSchool('nope').length === 0);
ok('id 로 찾는다', siteById('hangpaduri')?.name === '항파두리 항몽유적');

// ── 기관 표 ──────────────────────────────────────────────
ok('기관이 여섯 곳 이상', CIVIC_PLACES.length >= 6);
for (const p of CIVIC_PLACES) {
  ok(`${p.kind}: 사람이 둘 이상`, p.people.length >= 2);
  ok(`${p.kind}: 이야기가 있다`, (p.guide?.length ?? 0) >= 4);
  ok(`${p.kind}: 이야기꾼이 실제로 있는 사람이다`,
    p.guideAt !== undefined && !!p.people[p.guideAt]);
  ok(`${p.kind}: 놓을 물건이 있다`, (p.fixtures?.length ?? 0) >= 1);
  for (const g of p.guide ?? []) {
    ok(`${p.kind}/${g.title}: ** 짝이 맞는다`, (g.body.match(/\*\*/g) ?? []).length % 2 === 0);
  }
}
// 농협은 관공서가 아니라고 적어 두었나
ok('농협은 관공서가 아니라고 알려준다', !!civicByKind('nonghyup')?.notPublic);
ok('읍사무소는 관공서다', !civicByKind('townhall')?.notPublic);

// ── 심부름 그래프 ────────────────────────────────────────
ok('심부름이 스무 개 이상', QUESTS.length >= 20);
ok('심부름 id 가 겹치지 않는다', new Set(QUESTS.map((q) => q.id)).size === QUESTS.length);

const chapterIds = new Set(CHAPTERS.map((c) => c.id));
for (const q of QUESTS) {
  const t = q.id;
  ok(`${t}: 에피소드가 있다`, chapterIds.has(q.chapter));
  ok(`${t}: 시키는 말이 있다`, q.ask.length >= 15);
  ok(`${t}: 상 주는 말이 있다`, q.reward.length >= 15);
  ok(`${t}: 시키는 말과 상 주는 말이 다르다`, q.ask !== q.reward);
  ok(`${t}: ** 짝이 맞는다`,
    (q.ask.match(/\*\*/g) ?? []).length % 2 === 0 && (q.reward.match(/\*\*/g) ?? []).length % 2 === 0);

  /** **없는 사람이 주는 심부름은 없다.** */
  const place = civicByKind(q.giver.placeKind);
  ok(`${t}: 주는 기관이 있다`, !!place);
  ok(`${t}: 주는 사람이 실제로 있다`, !!place?.people[q.giver.at]);

  /** **없는 곳으로 보내지 않는다.** */
  for (const c of [...q.need, ...(q.unlock ?? [])]) {
    if (c.kind === 'site') ok(`${t}: ${c.siteId} 는 있는 곳이다`, !!siteById(c.siteId));
    if (c.kind === 'guide') ok(`${t}: ${c.placeKind} 는 있는 기관이다`, !!civicByKind(c.placeKind));
    if (c.kind === 'quest') ok(`${t}: ${c.questId} 는 있는 심부름이다`, QUESTS.some((x) => x.id === c.questId));
  }

  if (q.quiz) {
    ok(`${t}: 보기가 넷이다`, q.quiz.choices.length === 4);
    ok(`${t}: 정답 번호가 보기 안에 있다`, q.quiz.correct >= 0 && q.quiz.correct < 4);
    ok(`${t}: 보기가 겹치지 않는다`, new Set(q.quiz.choices).size === 4);
    ok(`${t}: 왜 그런지가 있다`, q.quiz.why.length >= 10);
  }

  // 유적으로 보내는 심부름은 그 유적이 이 학교 마을에 있어야 한다
  for (const c of q.need) {
    if (c.kind === 'site') {
      ok(`${t}: ${c.siteId} 가 애월초 마을에 있다`,
        sitesOfSchool(SCHOOL).some((s) => s.id === c.siteId));
    }
  }
}

/**
 * **고리가 끊기면 안 된다.**
 * 아무것도 안 한 상태에서 시작할 수 있는 심부름이 하나는 있어야 한다.
 */
const empty = new Set();
ok('맨 처음에도 할 수 있는 심부름이 있다', openQuests(QUESTS, empty).length >= 1);

/**
 * **다 할 수 있어야 한다.**
 * 조건을 하나씩 채워 나가면 결국 스무 개가 다 열려야 한다.
 * 안 열리는 게 있으면 그건 **영원히 못 하는 심부름**이다.
 */
function simulate() {
  const done = new Set();
  // 기관 이야기는 언제든 들을 수 있다
  for (const p of CIVIC_PLACES) done.add(placeKey(p.kind));
  // 유적도 언제든 갈 수 있다
  for (const s of LOCAL_SITES) done.add(siteKey(s.id));

  let moved = true;
  let rounds = 0;
  while (moved && rounds++ < 60) {
    moved = false;
    for (const q of QUESTS) {
      if (done.has(questKey(q.id))) continue;
      const st = questState(q, done);
      if (st === 'locked') continue;
      // 묻고 가는 심부름은 답을 맞히면 끝난다고 본다
      if (st === 'ready' || q.quiz) { done.add(questKey(q.id)); moved = true; }
    }
  }
  return done;
}
const finished = simulate();
const stuck = QUESTS.filter((q) => !finished.has(questKey(q.id)));
ok(`심부름이 모두 끝까지 열린다 (${QUESTS.length - stuck.length}/${QUESTS.length})`, stuck.length === 0);
if (stuck.length) fails.push(`  못 여는 심부름: ${stuck.map((q) => q.id).join(', ')}`);

/** 다 하면 뱃지도 다 모여야 한다 */
ok('다 하면 뱃지를 다 모은다', badgesOf(QUESTS, finished).length === QUESTS.filter((q) => q.badge).length);
ok('다 하면 마을 박사가 된다', rankOf(doneQuests(QUESTS, finished).length).label === '마을 박사');
ok('다 하면 다음 등급이 없다', toNextRank(doneQuests(QUESTS, finished).length) === null);
ok('다 하면 할 일이 없다', openQuests(QUESTS, finished).length === 0);

// 에피소드가 다 채워진다
for (const ch of CHAPTERS) {
  ok(`${ch.id}: 심부름이 둘 이상`, QUESTS.filter((q) => q.chapter === ch.id).length >= 2);
  ok(`${ch.id}: 다 하면 완성된다`, chapterProgress(QUESTS, ch.id, finished).complete);
  ok(`${ch.id}: 처음엔 안 채워져 있다`, chapterProgress(QUESTS, ch.id, empty).done === 0);
}

// ── 상태 판정 ────────────────────────────────────────────
const first = QUESTS.find((q) => !q.unlock);
ok('앞이 없는 심부름은 처음부터 뜬다', !!first && questState(first, empty) === 'todo');

const jin = QUESTS.find((q) => q.id === 'time-jinseong');
ok('애월진성 심부름은 처음엔 할 일이다', questState(jin, empty) === 'todo');
ok('다녀오면 알릴 차례가 된다', questState(jin, new Set([siteKey('aewol-jinseong')])) === 'ready');
ok('알리면 끝난다', questState(jin, new Set([questKey('time-jinseong')])) === 'done');

const hang = QUESTS.find((q) => q.id === 'time-hangpaduri');
ok('앞을 안 했으면 안 뜬다', questState(hang, empty) === 'locked');
ok('앞을 하면 뜬다', questState(hang, new Set([questKey('time-jinseong')])) === 'todo');

/**
 * **묻고 가는 심부름은 다녀오는 것만으로 안 끝난다.**
 *
 * 처음엔 `q.need.length === 0` 인 첫 심부름을 집었는데, 그건 앞이 잠겨 있어서
 * `locked` 였다 — 검증이 엉뚱한 걸 보고 있었다. 잠금을 풀고 나서 봐야 한다.
 */
const quizQ = QUESTS.find((q) => q.quiz && q.need.length === 0);
const unlocked = new Set((quizQ.unlock ?? []).map((c) =>
  c.kind === 'quest' ? questKey(c.questId) : c.kind === 'site' ? siteKey(c.siteId) : placeKey(c.placeKind)
));
ok('묻고 가는 심부름은 잠금이 풀려도 저절로 ready 가 안 된다',
  questState(quizQ, unlocked) === 'todo');
ok('잠금 전에는 안 뜬다', !quizQ.unlock || questState(quizQ, empty) === 'locked');

// 사람마다 다른 심부름을 준다
const townQuests = questsAtPlace(QUESTS, 'townhall', finished);
ok('읍사무소는 심부름을 여럿 준다', townQuests.length >= 3);
ok('읍사무소 사람 여럿이 나눠 준다', new Set(townQuests.map((q) => q.giver.at)).size >= 2);

/** **알릴 것이 먼저다** — 상 받을 게 있는데 새 심부름을 주면 헷갈린다 */
const readyOnly = new Set([siteKey('aewol-jinseong'), placeKey('townhall')]);
const who = questOfPerson(QUESTS, 'townhall', 2, readyOnly);
ok('알릴 것이 있으면 그것부터 준다', who?.id === 'time-jinseong');

// 심부름이 어디로 보내나
ok('유적으로 보내는 심부름은 그 유적을 가리킨다',
  questTarget(jin)?.kind === 'site' && questTarget(jin)?.id === 'aewol-jinseong');
const roundPost = QUESTS.find((q) => q.id === 'round-post');
ok('기관으로 보내는 심부름은 그 기관을 가리킨다',
  questTarget(roundPost)?.kind === 'place' && questTarget(roundPost)?.id === 'post_office');

// ── 등급 ─────────────────────────────────────────────────
ok('처음엔 견습이다', rankOf(0).label === '견습 조사원');
ok('등급이 차례로 오른다', RANKS.every((r, i) => i === 0 || RANKS[i - 1].need < r.need));
ok('마지막 등급이 심부름 수와 맞는다', RANKS[RANKS.length - 1].need <= QUESTS.length);
ok('다음 등급까지 몇 개인지 알려준다', toNextRank(0)?.left === RANKS[1].need);

/**
 * **다른 학교에서는 갈 수 없는 심부름이 안 뜬다.**
 * 심부름 표는 한 벌인데 유적은 학교마다 다르다. 애월 유적으로 보내는 심부름이
 * 다른 학교에 그대로 남으면 **영영 못 끝내는 심부름**이 된다 — 실제로 그랬다.
 */
const otherSchool = defaultsFor('zz-somewhere-else');
ok('다른 학교에는 애월 유적이 없다', otherSchool.sites.length === 0);
ok('그 학교에는 애월 유적으로 보내는 심부름도 없다',
  !otherSchool.quests.some((q) => q.need.some((c) => c.kind === 'site')));
ok('그래도 기관 심부름은 남는다', otherSchool.quests.length > 0);
ok('다른 학교 기본값에도 막힌 곳이 없다', errorsOf(checkRpg(otherSchool)).length === 0);
ok('애월초는 심부름이 다 남는다', defaultsFor(SCHOOL).quests.length === QUESTS.length);

console.log(fails.length === 0 ? `✅ ${pass}개 통과` : `❌ ${fails.length}개 실패 (${pass}개 통과)`);
fails.forEach((f) => console.log('   -', f));
process.exit(fails.length === 0 ? 0 : 1);
