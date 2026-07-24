/**
 * 마을 조사대 내용 고치기 — 덮어쓰기와 검사 검증.
 *
 * **선생님이 고칠 수 있게 되면 망가뜨릴 수도 있게 된다.**
 * 없는 곳으로 보내는 심부름, 앞뒤가 돌아버린 고리, 사라진 사람.
 * 그걸 저장 전에 잡는 게 `checkRpg` 다 — 여기서 그게 진짜 잡는지 본다.
 *
 * 실행: node --experimental-strip-types scripts/verify-rpg-content.mjs
 */
import {
  applyOverrides, checkRpg, defaultsFor, errorsOf, isUsableId,
} from '../src/lib/rpg-content.ts';

let pass = 0;
const fails = [];
const ok = (n, c) => (c ? pass++ : fails.push(n));

const S = 'aewol-elementary';
const base = defaultsFor(S);

/** 기본값은 그 자체로 성해야 한다 — 코드에 적은 것도 같은 규칙을 지킨다 */
const baseProblems = checkRpg(base);
ok(`기본값에 막힌 곳이 없다 (${errorsOf(baseProblems).length}건)`, errorsOf(baseProblems).length === 0);
if (errorsOf(baseProblems).length) {
  errorsOf(baseProblems).slice(0, 5).forEach((p) => fails.push(`  ${p.where}: ${p.message}`));
}

// ── 덮어쓰기 ─────────────────────────────────────────────
ok('아무것도 안 고치면 기본값 그대로',
  applyOverrides(S, {}).sites.length === base.sites.length);

const renamed = applyOverrides(S, {
  sites: { 'aewol-jinseong': { value: { ...siteVal('aewol-jinseong'), name: '우리 성터' } } },
});
ok('이름을 고치면 바뀐다', renamed.sites.find((x) => x.id === 'aewol-jinseong')?.name === '우리 성터');
ok('고쳐도 개수는 그대로', renamed.sites.length === base.sites.length);
ok('다른 곳은 안 바뀐다',
  renamed.sites.find((x) => x.id === 'hangpaduri')?.name === base.sites.find((x) => x.id === 'hangpaduri')?.name);

/** **감추기지 지우기가 아니다** — 기본값은 그대로 있다 */
const hidden = applyOverrides(S, { sites: { billemot: { hidden: true } } });
ok('감추면 그 학교에서 안 보인다', !hidden.sites.some((x) => x.id === 'billemot'));
ok('감춰도 기본값은 살아 있다', defaultsFor(S).sites.some((x) => x.id === 'billemot'));
ok('감춘 것을 되돌리면 다시 보인다',
  applyOverrides(S, {}).sites.some((x) => x.id === 'billemot'));

/** 학교가 새로 만든 것 */
const added = applyOverrides(S, {
  sites: {
    'our-tree': {
      value: {
        name: '우리 마을 팽나무', emoji: '🌲', axis: 'life', era: null, dir: 'E', km: 0.2,
        open: true, oneLine: '마을 어귀에 삼백 년 된 나무가 있어요.',
        pages: [{ title: '언제부터', body: '아주 오래전부터 여기 있었어요.' }],
        keywords: ['팽나무'], sources: [{ label: '마을회', url: 'https://example.com/a' }],
      },
    },
  },
});
ok('새로 만든 곳이 들어간다', added.sites.some((x) => x.id === 'our-tree'));
ok('새로 만든 곳도 이 학교 것이다',
  added.sites.find((x) => x.id === 'our-tree')?.schoolIds.includes(S) === true);
ok('새로 만들어도 기본값은 그대로', added.sites.length === base.sites.length + 1);
ok('새로 만든 곳에 문제가 없다', errorsOf(checkRpg(added)).length === 0);

// 기관도 같은 방식
const placeEdited = applyOverrides(S, {
  places: { townhall: { value: { ...placeVal('townhall'), label: '애월읍 행정복지센터' } } },
});
ok('기관 이름을 고치면 바뀐다',
  placeEdited.places.find((x) => x.kind === 'townhall')?.label === '애월읍 행정복지센터');
ok('기관의 kind 는 그대로다',
  placeEdited.places.filter((x) => x.kind === 'townhall').length === 1);

// ── 검사가 실제로 잡는가 ─────────────────────────────────
const err = (c) => errorsOf(checkRpg(c)).map((p) => p.message).join(' | ');

/** 없는 곳으로 보내기 */
const deadSite = {
  ...base,
  quests: [{ ...base.quests[0], id: 'zz', need: [{ kind: 'site', siteId: 'nowhere' }] }, ...base.quests],
};
ok('없는 곳으로 보내면 잡는다', err(deadSite).includes('없는 곳으로 보내요'));

/** 없는 기관 */
const deadPlace = {
  ...base,
  quests: [{ ...base.quests[0], id: 'zz', giver: { placeKind: 'nowhere', at: 0 }, need: [] }, ...base.quests],
};
ok('없는 기관이 주면 잡는다', err(deadPlace).includes('주는 기관'));

/** 없는 사람 */
const deadPerson = {
  ...base,
  quests: [{ ...base.quests[0], id: 'zz', giver: { placeKind: 'townhall', at: 99 }, need: [] }, ...base.quests],
};
ok('없는 사람이 주면 잡는다', err(deadPerson).includes('99번째 사람이 없어요') || err(deadPerson).includes('번째 사람이 없어요'));

/**
 * **고리를 만들면 잡는다.**
 * A 는 B 를 기다리고 B 는 A 를 기다리면 둘 다 영원히 안 뜬다.
 * 화면에서는 그냥 없는 것처럼 보여서 아무도 모른다.
 */
const loop = {
  ...base,
  quests: [
    ...base.quests,
    { ...base.quests[0], id: 'loop-a', need: [], unlock: [{ kind: 'quest', questId: 'loop-b' }] },
    { ...base.quests[0], id: 'loop-b', need: [], unlock: [{ kind: 'quest', questId: 'loop-a' }] },
  ],
};
ok('앞뒤가 도는 심부름을 잡는다', err(loop).includes('안 열려요'));

/** 자기 자신을 앞에 걸기 */
const selfLock = {
  ...base,
  quests: [...base.quests, { ...base.quests[0], id: 'self', need: [], unlock: [{ kind: 'quest', questId: 'self' }] }],
};
ok('자기 자신을 앞에 걸면 잡는다', err(selfLock).includes('자기 자신'));

/** 이야기꾼 자리가 비면 */
const badGuide = {
  ...base,
  places: base.places.map((p) => (p.kind === 'library' ? { ...p, guideAt: 9 } : p)),
};
ok('없는 사람을 이야기꾼으로 두면 잡는다', err(badGuide).includes('이야기해 줄 사람이 없는 자리'));

/** 기관에서 사람을 지우면, 그 사람이 주던 심부름이 걸린다 */
const removedPerson = {
  ...base,
  places: base.places.map((p) => (p.kind === 'townhall' ? { ...p, people: [p.people[0]], guideAt: 0 } : p)),
};
ok('사람을 지우면 그 사람이 주던 심부름이 걸린다', errorsOf(checkRpg(removedPerson)).length > 0);

/** 유적을 감추면, 거기로 보내던 심부름이 걸린다 */
const hidSite = { ...base, sites: base.sites.filter((s) => s.id !== 'aewol-jinseong') };
ok('유적을 감추면 그리로 보내던 심부름이 걸린다', err(hidSite).includes('없는 곳으로 보내요'));

/** 문제(quiz) 검사 */
const badQuiz = {
  ...base,
  quests: [...base.quests, {
    ...base.quests[0], id: 'q-bad', need: [],
    quiz: { q: '', choices: ['하나'], correct: 5, why: '' },
  }],
};
const bq = err(badQuiz);
ok('보기가 모자라면 잡는다', bq.includes('보기가 두 개는'));
ok('정답 번호가 밖이면 잡는다', bq.includes('정답 번호가 보기 밖'));
ok('문제가 비면 잡는다', bq.includes('문제가 비어'));

/** 유튜브 id */
const badVideo = {
  ...base,
  sites: base.sites.map((s) => (s.id === 'aewol-jinseong' ? { ...s, videoId: 'https://youtu.be/abc' } : s)),
};
ok('유튜브 주소를 통째로 넣으면 잡는다', err(badVideo).includes('유튜브 영상 id'));

/** 같은 id 두 번 */
const dup = { ...base, quests: [...base.quests, base.quests[0]] };
ok('같은 심부름 id 가 두 번이면 잡는다', err(dup).includes('같은 id'));

/** 비어 있는 것들 */
const blank = {
  sites: [{ ...base.sites[0], name: '', oneLine: '', pages: [] }],
  places: [{ ...base.places[0], label: '', people: [] }],
  quests: [],
};
const bl = err(blank);
ok('이름이 없으면 잡는다', bl.includes('이름이 없어요'));
ok('읽을 내용이 없으면 잡는다', bl.includes('읽을 내용이 없어요'));
ok('사람이 없으면 잡는다', bl.includes('사람이 한 명도 없어요'));

/** 경고는 막지 않는다 — 출처가 없다고 저장까지 막으면 아무것도 못 고친다 */
const noSource = { ...base, sites: base.sites.map((s) => ({ ...s, sources: [] })) };
const nsp = checkRpg(noSource);
ok('출처가 없으면 알려는 준다', nsp.some((p) => p.message.includes('출처가 없어요')));
ok('출처가 없다고 저장까지 막지는 않는다', errorsOf(noSource === noSource ? nsp : nsp).length === 0);

// ── id 모양 ──────────────────────────────────────────────
ok('쓸 수 있는 id', isUsableId('aewol-jinseong'));
ok('숫자도 된다', isUsableId('site-2'));
ok('대문자는 안 된다', !isUsableId('Aewol'));
ok('한글은 안 된다', !isUsableId('애월진성'));
ok('너무 짧으면 안 된다', !isUsableId('a'));
ok('빈 것도 안 된다', !isUsableId(''));
ok('공백은 안 된다', !isUsableId('a b'));
ok('- 로 시작하면 안 된다', !isUsableId('-a'));

console.log(fails.length === 0 ? `✅ ${pass}개 통과` : `❌ ${fails.length}개 실패 (${pass}개 통과)`);
fails.forEach((f) => console.log('   -', f));
process.exit(fails.length === 0 ? 0 : 1);

// ───────────────────────────────────────────────────────────
function siteVal(id) {
  const s = base.sites.find((x) => x.id === id);
  const { id: _i, schoolIds: _s, ...rest } = s;
  void _i; void _s;
  return rest;
}
function placeVal(kind) {
  const p = base.places.find((x) => x.kind === kind);
  const { kind: _k, ...rest } = p;
  void _k;
  return rest;
}
