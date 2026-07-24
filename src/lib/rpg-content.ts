import { CIVIC_PLACES, type CivicPlace } from './civic-places.ts';
import { LOCAL_SITES, type LocalSite } from './local-sites.ts';
import { QUESTS, type Quest } from './village-rpg.ts';

/**
 * 마을 조사대의 **내용을 학교가 고친다.**
 *
 * 코드에 적힌 표(`local-sites` · `civic-places` · `village-rpg`)는 이제
 * **기본값**이다. 학교는 그 위에 덮어쓰거나, 새로 만들거나, 감출 수 있다.
 *
 * ---
 *
 * **왜 코드를 안 고치고 이렇게 하나.**
 *
 * 고장 이야기는 그 고장 선생님이 제일 잘 안다. 학교 상징(교훈·교화)에서
 * 이미 같은 결론을 냈다 — "교화나 교표는 그 학교 선생님이 제일 잘 알고,
 * 틀려도 다시 고치면 그만이다."
 *
 * 그런데 지금까지는 유적 글 한 줄을 고치려 해도 **코드를 고쳐 배포**해야 했다.
 * 그러면 아무도 안 고친다. 안 고치면 애월 아이들은 애월 이야기만 하고,
 * 다른 학교는 **남의 마을 이야기**를 보게 된다.
 *
 * ---
 *
 * **덮어쓰기지 지우기가 아니다.**
 *
 * 기본값을 지우지 않는다. 학교가 `hidden: true` 를 적으면 그 학교에서만
 * 안 보인다. 그래야 실수로 지워도 **되돌릴 수 있다** —
 * 애월초가 통째로 이름이 바뀌었던 일에서 배운 것이다.
 */

/** 학교가 저장하는 것 — 기본값을 덮거나, 새로 만들거나, 감춘다 */
export interface Override<T> {
  /** 이 학교에서만 안 보이게 */
  hidden?: boolean;
  /** 바뀐 내용 (없으면 기본값 그대로) */
  value?: T;
}

export type SiteDoc = Override<Omit<LocalSite, 'id' | 'schoolIds'>>;
export type PlaceDoc = Override<Omit<CivicPlace, 'kind'>>;
export type QuestDoc = Override<Omit<Quest, 'id'>>;

export interface RpgContent {
  sites: LocalSite[];
  places: CivicPlace[];
  quests: Quest[];
}

/**
 * 이 학교의 기본값.
 *
 * **유적은 학교마다 다르다.** 애월진성 심부름은 애월초에서만 뜻이 있다.
 * 그런데 심부름 표는 한 벌뿐이라, 다른 학교에는 **갈 수 없는 곳으로 보내는
 * 심부름**이 그대로 남는다. 실제로 그랬다 — 검증에서 잡혔다.
 *
 * 그래서 **갈 곳이 없는 심부름은 아예 빼고** 준다.
 * 그 심부름을 기다리던 뒤 심부름도 같이 빠진다(안 그러면 영영 안 열린다).
 * 그 학교 선생님이 자기 고장 유적을 넣고 심부름을 새로 만들면 된다.
 */
export function defaultsFor(schoolId: string): RpgContent {
  const sites = LOCAL_SITES.filter((s) => s.schoolIds.includes(schoolId));
  return {
    sites,
    places: CIVIC_PLACES,
    quests: pruneQuests(QUESTS, new Set(sites.map((s) => s.id)), new Set(CIVIC_PLACES.map((p) => p.kind))),
  };
}

/**
 * 갈 곳이 없는 심부름을 뺀다.
 *
 * **한 번으로 안 끝난다.** A 가 빠지면 A 를 기다리던 B 도 빠져야 하고,
 * B 를 기다리던 C 도 빠져야 한다. 남는 게 없을 때까지 돌린다.
 */
export function pruneQuests(quests: Quest[], siteIds: Set<string>, placeKinds: Set<string>): Quest[] {
  let out = quests;
  for (let round = 0; round < 20; round++) {
    const ids = new Set(out.map((q) => q.id));
    const next = out.filter((q) => {
      if (!placeKinds.has(q.giver.placeKind)) return false;
      return [...q.need, ...(q.unlock ?? [])].every((c) =>
        c.kind === 'site' ? siteIds.has(c.siteId)
          : c.kind === 'guide' ? placeKinds.has(c.placeKind)
            : ids.has(c.questId)
      );
    });
    if (next.length === out.length) return next;
    out = next;
  }
  return out;
}

/**
 * 기본값 위에 학교가 고친 것을 얹는다.
 *
 * **차례가 중요하다.** 기본값을 먼저 깔고, 같은 id 가 있으면 갈아 끼우고,
 * 처음 보는 id 는 뒤에 붙이고, 감춘 것은 뺀다.
 */
function merge<T extends { id: string }, V>(
  base: T[],
  stored: Record<string, Override<V>>,
  fill: (id: string, v: V) => T
): T[] {
  const out: T[] = [];
  const seen = new Set<string>();

  for (const item of base) {
    seen.add(item.id);
    const o = stored[item.id];
    if (o?.hidden) continue;
    out.push(o?.value ? fill(item.id, o.value) : item);
  }
  // 학교가 새로 만든 것
  for (const [id, o] of Object.entries(stored)) {
    if (seen.has(id) || o.hidden || !o.value) continue;
    out.push(fill(id, o.value));
  }
  return out;
}

export function applyOverrides(
  schoolId: string,
  stored: {
    sites?: Record<string, SiteDoc>;
    places?: Record<string, PlaceDoc>;
    quests?: Record<string, QuestDoc>;
  }
): RpgContent {
  const base = defaultsFor(schoolId);

  const sites = merge(
    base.sites,
    stored.sites ?? {},
    (id, v) => ({ ...v, id, schoolIds: [schoolId] })
  );

  // 기관은 `kind` 가 곧 id 다 — 잠깐 id 를 붙여 같은 방식으로 합치고 다시 뗀다
  const placeBase = base.places.map((x) => ({ ...x, id: x.kind }));
  const places = merge(
    placeBase,
    stored.places ?? {},
    (id, v) => ({ ...v, kind: id, id })
  ).map((x) => {
    const { id: _drop, ...rest } = x;
    void _drop;
    return rest as CivicPlace;
  });

  const quests = merge(
    base.quests,
    stored.quests ?? {},
    (id, v) => ({ ...v, id })
  );

  return { sites, places, quests };
}

// ───────────────────────────────────────────────────────────
// 검사
// ───────────────────────────────────────────────────────────

export interface Problem {
  /** `error` 면 아이가 막힌다. `warn` 은 아쉬운 정도. */
  level: 'error' | 'warn';
  /** 어디가 */
  where: string;
  /** 무엇이 */
  message: string;
}

/**
 * **막다른 길을 막는다.**
 *
 * 선생님이 심부름을 고치다가 없는 곳으로 보내거나, 앞뒤를 거꾸로 걸면
 * 아이는 마을에서 헤매다 그만둔다. **저장하기 전에 알려줘야 한다.**
 *
 * 이 함수는 세 곳에서 같이 쓴다:
 * - 어드민 화면 — 고치는 중에 바로 보여준다
 * - 서버 — 저장할 때 막는다 (화면만 막으면 막은 게 아니다)
 * - 검증 스크립트 — 코드에 적은 기본값도 이 규칙을 지키는지 본다
 */
export function checkRpg(c: RpgContent): Problem[] {
  const p: Problem[] = [];
  const siteIds = new Set(c.sites.map((s) => s.id));
  const placeByKind = new Map(c.places.map((x) => [x.kind, x]));
  const questIds = new Set(c.quests.map((q) => q.id));

  // ── 유적 ──
  for (const s of c.sites) {
    const w = `유적 · ${s.name || s.id}`;
    if (!s.name?.trim()) p.push({ level: 'error', where: w, message: '이름이 없어요' });
    if (!s.oneLine?.trim()) p.push({ level: 'error', where: w, message: '한 줄 소개가 없어요' });
    if (!s.pages?.length) p.push({ level: 'error', where: w, message: '읽을 내용이 없어요' });
    s.pages?.forEach((pg, i) => {
      if (!pg.title?.trim()) p.push({ level: 'error', where: w, message: `${i + 1}번째 장에 제목이 없어요` });
      if (!pg.body?.trim()) p.push({ level: 'error', where: w, message: `${i + 1}번째 장에 내용이 없어요` });
      if ((pg.body?.match(/\*\*/g)?.length ?? 0) % 2 !== 0) {
        p.push({ level: 'warn', where: w, message: `${i + 1}번째 장의 **강조** 별표 짝이 안 맞아요` });
      }
    });
    if (!s.sources?.length) {
      p.push({ level: 'warn', where: w, message: '출처가 없어요. 고장 이야기는 어디서 왔는지 밝혀 주세요' });
    }
    s.sources?.forEach((src) => {
      if (!/^https?:\/\/.+\..+/.test(src.url || '')) {
        p.push({ level: 'warn', where: w, message: `출처 주소가 이상해요 (${src.label || src.url})` });
      }
    });
    if (!s.open && !s.closedWhy?.trim()) {
      p.push({ level: 'warn', where: w, message: '못 가는 곳이면 왜 못 가는지 적어 주세요' });
    }
    if (s.km < 0 || s.km > 50) p.push({ level: 'warn', where: w, message: '거리가 너무 멀어요 (0~50km)' });
    if (s.videoId && !/^[A-Za-z0-9_-]{11}$/.test(s.videoId)) {
      p.push({ level: 'error', where: w, message: '유튜브 영상 id 가 이상해요' });
    }
  }
  if (c.sites.length !== siteIds.size) {
    p.push({ level: 'error', where: '유적', message: '같은 id 가 두 번 있어요' });
  }

  // ── 기관 ──
  for (const x of c.places) {
    const w = `기관 · ${x.label || x.kind}`;
    if (!x.label?.trim()) p.push({ level: 'error', where: w, message: '이름이 없어요' });
    if (!x.people?.length) p.push({ level: 'error', where: w, message: '사람이 한 명도 없어요' });
    x.people?.forEach((pe, i) => {
      if (!pe.name?.trim()) p.push({ level: 'error', where: w, message: `${i + 1}번째 사람 이름이 없어요` });
      if (!pe.job?.trim()) p.push({ level: 'warn', where: w, message: `${pe.name || i + 1} 이 무슨 일을 하는지 안 적혀 있어요` });
    });
    if (x.guideAt !== undefined && !x.people?.[x.guideAt]) {
      p.push({ level: 'error', where: w, message: '이야기해 줄 사람이 없는 자리를 가리켜요' });
    }
    if ((x.guide?.length ?? 0) === 0) {
      p.push({ level: 'warn', where: w, message: '들려줄 이야기가 없어요' });
    }
    x.guide?.forEach((g, i) => {
      if (!g.title?.trim() || !g.body?.trim()) {
        p.push({ level: 'error', where: w, message: `이야기 ${i + 1}장이 비어 있어요` });
      }
    });
    /**
     * **만들어 놓고 못 들어가는 기관**을 막는다.
     * 마을 건물은 이름으로 알아본다. 기본 기관이 아닌데 이름 힌트가 없으면
     * 어드민에는 있는데 마을에는 문이 안 생긴다 — 그게 제일 알기 어렵다.
     */
    if (!KNOWN_KINDS.has(x.kind) && !(x.nameHints?.length)) {
      p.push({
        level: 'warn',
        where: w,
        message: '마을에서 알아볼 이름이 없어요. 건물 이름을 적어야 아이가 들어갈 수 있어요',
      });
    }
  }

  // ── 심부름 ──
  for (const q of c.quests) {
    const w = `심부름 · ${q.title || q.id}`;
    if (!q.title?.trim()) p.push({ level: 'error', where: w, message: '제목이 없어요' });
    if (!q.ask?.trim()) p.push({ level: 'error', where: w, message: '시키는 말이 없어요' });
    if (!q.reward?.trim()) p.push({ level: 'error', where: w, message: '마쳤을 때 하는 말이 없어요' });

    const giver = placeByKind.get(q.giver?.placeKind);
    if (!giver) {
      p.push({ level: 'error', where: w, message: `주는 기관(${q.giver?.placeKind})이 없어요` });
    } else if (!giver.people[q.giver.at]) {
      p.push({ level: 'error', where: w, message: `${giver.label} 에 ${q.giver.at + 1}번째 사람이 없어요` });
    }

    for (const cond of [...(q.need ?? []), ...(q.unlock ?? [])]) {
      if (cond.kind === 'site' && !siteIds.has(cond.siteId)) {
        p.push({ level: 'error', where: w, message: `없는 곳으로 보내요 (${cond.siteId})` });
      }
      if (cond.kind === 'guide' && !placeByKind.has(cond.placeKind)) {
        p.push({ level: 'error', where: w, message: `없는 기관으로 보내요 (${cond.placeKind})` });
      }
      if (cond.kind === 'quest' && !questIds.has(cond.questId)) {
        p.push({ level: 'error', where: w, message: `없는 심부름을 가리켜요 (${cond.questId})` });
      }
    }

    if (q.unlock?.some((cd) => cd.kind === 'quest' && cd.questId === q.id)) {
      p.push({ level: 'error', where: w, message: '자기 자신을 앞 심부름으로 걸었어요' });
    }
    if (q.need?.some((cd) => cd.kind === 'quest' && cd.questId === q.id)) {
      p.push({ level: 'error', where: w, message: '자기 자신을 끝내는 조건으로 걸었어요' });
    }
    if (!q.quiz && !(q.need?.length)) {
      p.push({ level: 'warn', where: w, message: '끝나는 조건도 문제도 없어요 — 받자마자 끝나요' });
    }

    if (q.quiz) {
      if ((q.quiz.choices?.length ?? 0) < 2) {
        p.push({ level: 'error', where: w, message: '문제 보기가 두 개는 있어야 해요' });
      } else if (new Set(q.quiz.choices).size !== q.quiz.choices.length) {
        p.push({ level: 'warn', where: w, message: '문제 보기가 겹쳐요' });
      }
      if (q.quiz.correct < 0 || q.quiz.correct >= (q.quiz.choices?.length ?? 0)) {
        p.push({ level: 'error', where: w, message: '정답 번호가 보기 밖이에요' });
      }
      if (!q.quiz.q?.trim()) p.push({ level: 'error', where: w, message: '문제가 비어 있어요' });
      if (!q.quiz.why?.trim()) p.push({ level: 'warn', where: w, message: '왜 그런지 설명이 없어요' });
    }
  }
  if (c.quests.length !== questIds.size) {
    p.push({ level: 'error', where: '심부름', message: '같은 id 가 두 번 있어요' });
  }

  /**
   * **못 여는 심부름을 찾는다.**
   *
   * 앞뒤를 거꾸로 걸거나 고리를 만들면(A→B→A) 그 심부름은 **영원히 안 뜬다.**
   * 화면에서는 그냥 없는 것처럼 보여서 아무도 모른다.
   * 그래서 실제로 다 해 보고 남는 것이 있는지 본다.
   */
  const done = new Set<string>();
  for (const x of c.places) done.add(`place-${x.kind}`);
  for (const s of c.sites) done.add(`site-${s.id}`);
  let moved = true;
  let guard = 0;
  while (moved && guard++ < 200) {
    moved = false;
    for (const q of c.quests) {
      if (done.has(`quest-${q.id}`)) continue;
      const unlocked = (q.unlock ?? []).every((cd) => done.has(condKey(cd)));
      if (!unlocked) continue;
      const needed = (q.need ?? []).every((cd) => done.has(condKey(cd)));
      if (needed || q.quiz) { done.add(`quest-${q.id}`); moved = true; }
    }
  }
  for (const q of c.quests) {
    if (!done.has(`quest-${q.id}`)) {
      p.push({
        level: 'error',
        where: `심부름 · ${q.title || q.id}`,
        message: '아무리 해도 이 심부름은 안 열려요 (앞 심부름이 돌고 있거나 조건이 안 맞아요)',
      });
    }
  }

  return p;
}

function condKey(c: { kind: string; siteId?: string; placeKind?: string; questId?: string }): string {
  if (c.kind === 'site') return `site-${c.siteId}`;
  if (c.kind === 'guide') return `place-${c.placeKind}`;
  return `quest-${c.questId}`;
}

/** 코드에 이름 규칙이 들어 있는 기관들 — 이건 이름 힌트를 안 적어도 된다 */
const KNOWN_KINDS = new Set(CIVIC_PLACES.map((p) => p.kind));

export const errorsOf = (p: Problem[]) => p.filter((x) => x.level === 'error');

/** 새 id 를 만들 때 쓸 수 있는 모양인가 */
export function isUsableId(id: string): boolean {
  return /^[a-z0-9][a-z0-9-]{1,39}$/.test(id);
}
