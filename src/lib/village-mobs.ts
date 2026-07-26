/**
 * 마을을 더럽히는 것들 — **베어서 정화한다.**
 *
 * 걸어다닐 이유를 하나 더 만든다. 줍기(`village-collect.ts`)가 '눈에 띄면 줍는'
 * 조용한 일이라면, 이건 **맞서는 일**이다. 아이가 마을을 지나가는 사람이 아니라
 * **마을을 고치는 사람**이 된다.
 *
 * ---
 *
 * **죽이는 것이 아니라 정화하는 것이다.**
 *
 * 칼이 나오고 타격감이 있지만, 베면 피가 아니라 **물방울과 빛**이 튄다.
 * 쓰레기는 적이 아니라 치워야 할 것이다 — 초등학교에서 쓰는 화면이고,
 * 주제가 환경이라 이 편이 맞다. RPG 문법(체력·경직·넉백·데미지 숫자)은
 * 그대로 지킨다. 재미를 깎아서 얌전하게 만드는 것이 아니다.
 *
 * ---
 *
 * **상은 도장이 아니라 도감이다.**
 *
 * 줍기에서 정한 선을 그대로 지킨다 — *"걸어다닌다고 도장이 나오면
 * 숙제한 아이가 손해를 본다."* 전투는 **서버가 확인할 수 없다.**
 * "열 마리 잡았다" 는 화면이 하는 말이라, 처치마다 도장을 주면
 * 개발자도구로 무한히 찍어낼 수 있다.
 *
 * 그래서 **막을 수 없으면 값어치를 없앤다.** 정화한 것은 도감에 쌓이고,
 * 도장은 **한 자리를 다 치웠을 때 한 번만, 하나만** 준다.
 */

// 확장자를 적는다 — 검증 스크립트가 node 로 그대로 읽어서(`--experimental-strip-types`)
// 확장자가 없으면 못 찾는다. `goldenbell.ts` 도 같은 이유로 이렇게 쓴다.
import { itemsOfSpot } from './village-collect.ts';

/** 우두머리인가 — 우두머리는 칼이 안 통하고 문제를 풀어야 껍질이 깨진다 */
export type MobTier = 'normal' | 'boss';

export interface MobKind {
  id: string;
  emoji: string;
  name: string;
  /** 도감에 적는 한 줄 — 정화했을 때 배우는 것 */
  note: string;
  /** 몇 대 맞아야 정화되나 */
  hp: number;
  tier: MobTier;
  /** 몸통 색 */
  color: string;
  /** 바닷가에만 나오나 — 해안선 가까이에 놓는다 */
  shore?: boolean;
}

/**
 * 무엇이 나오나.
 *
 * **제주 바다에 실제로 밀려오는 것들**로 골랐다. 지어낸 괴물이 아니라
 * 진짜 있는 것이라야 도감이 뜻을 갖는다 — 줍기에서 세운 기준과 같다.
 * 한 줄 설명은 **아이가 몰랐을 법한 것** 하나씩만 담았다.
 */
export const MOB_KINDS: MobKind[] = [
  // ── 바다 ──
  {
    id: 'net',
    emoji: '🕸️',
    name: '버려진 그물',
    note: '폐그물이에요. 버려진 그물에 물고기와 바다거북이 걸려 죽는 것을 "유령어업"이라고 불러요.',
    hp: 3,
    tier: 'normal',
    color: '#5E7A6B',
    shore: true,
  },
  {
    id: 'buoy',
    emoji: '⚪',
    name: '부서진 부표',
    note: '양식장에서 쓰는 스티로폼 부표예요. 잘게 부서지면 미세플라스틱이 되어 물고기 몸속으로 들어가요.',
    hp: 2,
    tier: 'normal',
    color: '#DCD8CE',
    shore: true,
  },
  {
    id: 'bottle',
    emoji: '🧴',
    name: '떠밀려온 페트병',
    note: '페트병 하나가 자연에서 사라지는 데 450년쯤 걸려요. 우리가 5분 쓰고 버린 것이요.',
    hp: 2,
    tier: 'normal',
    color: '#7FB6D9',
    shore: true,
  },
  {
    id: 'bag',
    emoji: '🛍️',
    name: '비닐봉지 뭉치',
    note: '물에 뜬 비닐봉지는 해파리처럼 보여요. 바다거북이 그걸 먹이로 알고 삼켜요.',
    hp: 2,
    tier: 'normal',
    color: '#E4E9EC',
    shore: true,
  },
  {
    id: 'can',
    emoji: '🥫',
    name: '찌그러진 캔',
    note: '알루미늄 캔은 녹여서 다시 쓰면 새로 만들 때보다 에너지가 95%나 적게 들어요.',
    hp: 2,
    tier: 'normal',
    color: '#B9A88C',
    shore: true,
  },

  // ── 마을 ──
  {
    id: 'butt',
    emoji: '🚬',
    name: '담배꽁초 더미',
    note: '꽁초 필터는 솜이 아니라 플라스틱이에요. 길에 버리면 빗물에 쓸려 그대로 바다로 가요.',
    hp: 1,
    tier: 'normal',
    color: '#C7B49A',
  },
  {
    id: 'dump',
    emoji: '🗑️',
    name: '몰래 버린 쓰레기',
    note: '종량제 봉투에 안 담아 버린 것들이에요. 결국 누군가 치워야 하고, 그 몫은 우리 마을이 져요.',
    hp: 3,
    tier: 'normal',
    color: '#8C7F6E',
  },
  {
    id: 'tire',
    emoji: '🛞',
    name: '버려진 타이어',
    note: '고무는 썩지 않아요. 빗물이 고이면 모기가 알을 낳는 웅덩이가 되기도 해요.',
    hp: 3,
    tier: 'normal',
    color: '#3E3B38',
  },
  {
    id: 'cup',
    emoji: '🥤',
    name: '일회용 컵 더미',
    note: '종이컵 안쪽에도 얇은 비닐이 발려 있어요. 그래서 종이류로 그냥 버리면 재활용이 안 돼요.',
    hp: 2,
    tier: 'normal',
    color: '#E4DCCB',
  },
  {
    id: 'umbrella',
    emoji: '☂️',
    name: '부러진 우산',
    note: '우산은 천·철·플라스틱이 섞여 있어 통째로는 재활용이 안 돼요. 살과 천을 나눠 버려야 해요.',
    hp: 2,
    tier: 'normal',
    color: '#5B6E9C',
  },

  // ── 우두머리 — 칼이 안 통한다. 문제를 풀어야 껍질이 깨진다. ──
  {
    id: 'oil',
    emoji: '🛢️',
    name: '기름 얼룩',
    note: '배에서 새어 나온 기름이에요. 물 위에 얇은 막을 만들어 산소가 바닷속으로 못 들어가게 막아요.',
    hp: 3,
    tier: 'boss',
    color: '#3A3340',
    shore: true,
  },
  {
    id: 'smog',
    emoji: '☁️',
    name: '매연 구름',
    note: '자동차와 공장에서 나와요. 제주는 바람이 세서 잘 흩어지지만, 그래도 쌓이면 하늘이 뿌예져요.',
    hp: 3,
    tier: 'boss',
    color: '#6E6A6B',
  },
];

export const mobKindById = (id: string) => MOB_KINDS.find((k) => k.id === id);

/**
 * 한 자리에 두는 수.
 *
 * **촘촘해야 한다.** 열여섯으로는 하나 잡고 한참 걸어야 다음이 나왔다.
 * 멀리 것은 어차피 안 그리므로(SHOW_RANGE) 화면이 어수선해지지도 않는다.
 */
export const MOBS_PER_SPOT = 26;

/**
 * **처음 만나는 거리.**
 *
 * 이보다 가까이는 안 둔다 — 시작하자마자 코앞에 서 있으면 놀란다.
 * 그렇다고 멀면 한참을 걸어야 첫 마리를 만난다. 열세 걸음쯤이 적당하다.
 */
export const NEAR_M = 13;

/**
 * 서로 이만큼은 떨어뜨린다.
 * 칼이 닿는 거리(4.6m)의 갑절보다 넉넉해야 한 번 휘둘러 둘이 맞지 않는다.
 */
export const MIN_GAP = 12;

/**
 * **눈에 들어오는 거리.**
 *
 * 이 밖에 있는 것은 아예 안 그린다. 마을이 800m 인데 열여섯 마리를 늘 그려두면
 * 화면이 어수선하고(어느 게 가까운지 모른다) Html 이 열여섯 개 떠 있어 느리다.
 * 걸어가면 하나씩 나타나는 편이 낫다 — 그게 탐험이다.
 */
export const SHOW_RANGE = 95;
/** 이름표·체력까지 보이는 거리. 몸통보다 가까워야 글자가 안 뭉친다. */
export const LABEL_RANGE = 42;

/** 한 자리를 다 치우면 받는 도장 — **적게.** 줍기와 같은 선이다. */
export const STAMPS_PER_SPOT = 1;

/** 칼이 닿는 거리 (미터) */
export const ATTACK_RANGE = 4.6;
/** 칼이 닿는 각도 — 앞쪽 부채꼴. 뒤에 있는 것은 안 맞는다. */
export const ATTACK_ARC = Math.PI * 0.62;
/** 휘두르고 다시 휘두르기까지 */
export const ATTACK_COOLDOWN_MS = 400;
/** 이만큼 가까이 오면 몹이 깨어난다 (부르르 떨며 노려본다) */
export const AGGRO_RANGE = 11;
/** 우두머리에게 문제가 뜨는 거리 */
export const BOSS_TALK_RANGE = 5.2;

/** 맞았을 때 밀려나는 거리 */
export const KNOCKBACK = 1.15;
/** 맞고 못 움직이는 시간 (밀리초) — 경직 */
export const HIT_STUN_MS = 190;

export interface Mob {
  /**
   * 기록에 쌓이는 값 — `{자리}-{번호}-{종류}` 다.
   * 줍기와 같은 꼴이라 도감이 마을 데이터 없이도 열린다.
   */
  id: string;
  kind: MobKind;
  x: number;
  z: number;
}

/** 기록 한 줄에서 종류를 되찾는다 */
export const mobKindOfToken = (token: string) => token.split('-').pop() ?? '';

/** 씨앗 하나에서 0~1 — 같은 씨앗이면 늘 같은 값 */
function seeded(n: number): number {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h ^ 0x12345, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** 글자를 숫자 씨앗으로 */
function seedOf(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * 이 자리에 무엇이 어디 있나.
 *
 * ---
 *
 * **가까운 데서 먼 데로 깔아 나간다.**
 *
 * 처음에는 아무 데나 흩뿌리고 학교 앞마당을 통째로 비웠더니, **가장 가까운
 * 놈이 마흔 걸음 밖**이었다. 마을에 들어와서 한참을 걸어야 뭔가 나오고,
 * 그러다 만나면 그 뒤로 또 한참 아무것도 없었다.
 *
 * 그래서 **자리마다 거리를 정해 두고** 그 거리에 놓는다. 열세 걸음 앞에 첫
 * 마리, 그다음은 조금 더 멀리 — 걷는 내내 하나씩 나타난다. 시작 자리 둘레
 * 아홉 걸음만 비운다(코앞에서 튀어나오면 놀란다).
 *
 * 방향은 **황금각(137.5°)** 으로 돌린다. 마구잡이로 뽑으면 한쪽에 몰려서
 * 어느 쪽은 텅 비고 어느 쪽은 줄지어 선다.
 *
 * ---
 *
 * **종류는 놓인 자리가 정한다.**
 *
 * 먼저 자리를 잡고, 그 자리가 바닷가면 바다 것을, 뭍이면 뭍 것을 놓는다.
 * 종류를 먼저 뽑으면 소라 게가 밭 한가운데 서거나, 거리 배분이 무너진다.
 *
 * 우두머리는 **중간과 맨 끝**에 선다. 졸개로 손을 익힌 뒤에 만나야 한다.
 */
export function mobsOfSpot(
  spotId: string,
  radius: number,
  buildings: { p: [number, number][] }[],
  coast?: [number, number][][]
): Mob[] {
  const base = seedOf(`${spotId}:mob`);

  const boxes = buildings.map((b) => {
    const xs = b.p.map((p) => p[0]);
    const zs = b.p.map((p) => p[1]);
    return {
      minX: Math.min(...xs) - 2, maxX: Math.max(...xs) + 2,
      minZ: Math.min(...zs) - 2, maxZ: Math.max(...zs) + 2,
    };
  });
  const blocked = (x: number, z: number) =>
    boxes.some((b) => x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ)
    // 시작 자리 둘레만 비운다 — 눈앞에서 튀어나오면 놀란다
    || Math.hypot(x, z) < 9;

  const shorePts = (coast ?? []).flat();
  const hasShore = shorePts.length > 0;
  /** 이 자리가 바닷가인가 */
  const atShore = (x: number, z: number) =>
    hasShore && shorePts.some((p) => Math.hypot(p[0] - x, p[1] - z) < 34);

  /**
   * 가장 먼 놈이 서는 거리.
   *
   * **마을 끝까지 펴면 안 된다.** 애월 마을은 반지름이 830m 쯤인데, 열여섯
   * 마리를 거기까지 늘어놓으면 바깥쪽은 백오십 걸음에 하나씩이라 걸어도
   * 아무것도 안 나온다(실측 156m). 눈에 들어오는 거리가 95m 이니
   * **그보다 촘촘히** 깔려야 걷는 내내 만난다.
   *
   * 그래서 **가운데 220m 안에 모은다.** 바깥은 비지만, 거기는 원래
   * 워프로 건너다니는 구간이다.
   */
  const FAR = Math.min(radius * 0.45, 220);
  /** 황금각 — 돌려 놓으면 한쪽으로 몰리지 않는다 */
  const GOLDEN = Math.PI * (3 - Math.sqrt(5));

  /**
   * **주울 것 위에는 안 선다.**
   *
   * 둘 다 촘촘해지면서 소라 위에 폐그물이 서는 일이 생겼다. 그러면 싸우는
   * 중에 발밑에서 물건이 주워져 무슨 일이 일어난 건지 모른다.
   * 씨앗을 달리 타는 것만으로는 모자라서, 자리를 아예 비켜 놓는다.
   */
  const itemPts = itemsOfSpot(spotId, radius, buildings, coast);

  const fits = (x: number, z: number, taken: { x: number; z: number }[]) =>
    Math.abs(x) <= radius && Math.abs(z) <= radius
    && !blocked(x, z)
    && !taken.some((o) => Math.hypot(o.x - x, o.z - z) < MIN_GAP)
    && !itemPts.some((o) => Math.hypot(o.x - x, o.z - z) < 9);

  // ---- 1) 자리부터 잡는다 (가까운 것 → 먼 것) ----
  const spots: { x: number; z: number }[] = [];
  for (let slot = 0; slot < MOBS_PER_SPOT; slot++) {
    const t = slot / Math.max(1, MOBS_PER_SPOT - 1);
    // 앞쪽을 촘촘히, 뒤로 갈수록 성기게 — 걷는 만큼 만난다
    const target = NEAR_M + Math.pow(t, 1.35) * (FAR - NEAR_M);

    let done = false;
    for (let k = 0; k < 80 && !done; k++) {
      const s = base + slot * 7919 + k * 131;
      const ang = GOLDEN * slot + (seeded(s) - 0.5) * 1.2;
      const r = target * (0.86 + seeded(s + 1) * 0.28);
      const x = Math.round(Math.cos(ang) * r);
      const z = Math.round(Math.sin(ang) * r);
      if (!fits(x, z, spots)) continue;
      spots.push({ x, z });
      done = true;
    }
    // 그 거리에 자리가 없으면(건물이 빽빽하면) 아무 데나 — **수는 반드시 채운다.**
    // 모자라면 그 자리는 영영 다 못 치우고 상을 못 받는다.
    for (let k = 0; k < 400 && !done; k++) {
      const s = base + 500_000 + slot * 6151 + k * 97;
      const x = Math.round((seeded(s) - 0.5) * FAR * 2);
      const z = Math.round((seeded(s + 1) - 0.5) * FAR * 2);
      if (!fits(x, z, spots)) continue;
      spots.push({ x, z });
      done = true;
    }
  }

  // ---- 2) 자리에 맞는 종류를 얹는다 ----
  /** 우두머리가 설 차례 — 중간쯤과 맨 끝 */
  const bossSlots = new Set([Math.floor((spots.length - 1) * 0.55), spots.length - 1]);

  /**
   * **돌려가며 뽑는다.**
   *
   * 씨앗으로 아무 종류나 뽑았더니 열여섯 마리가 **세 종류뿐**이었다 —
   * 같은 것만 계속 나오면 도감이 안 채워지고 보는 재미도 없다.
   * 무리(바다/뭍 × 졸개/우두머리)마다 차례를 세어 한 바퀴씩 돌린다.
   */
  const turn = new Map<string, number>();
  const nextOf = (key: string, pool: MobKind[]) => {
    const n = turn.get(key) ?? Math.floor(seeded(base + seedOf(key)) * pool.length);
    turn.set(key, n + 1);
    return pool[n % pool.length];
  };

  return spots.map((p, i) => {
    const tier: MobTier = bossSlots.has(i) ? 'boss' : 'normal';
    const sea = atShore(p.x, p.z);
    const all = MOB_KINDS.filter((k) => k.tier === tier);
    const fit = all.filter((k) => !!k.shore === sea);
    const pool = fit.length ? fit : all;
    const kind = nextOf(`${tier}:${sea}`, pool);
    return { id: `${spotId}-${i}-${kind.id}`, kind, x: p.x, z: p.z };
  });
}

/** 진행 기록에서 이 자리를 다 치웠나 */
export const spotCleared = (spotId: string, cleared: ReadonlySet<string>, total: number) =>
  total > 0 && Array.from(cleared).filter((c) => c.startsWith(`${spotId}-`)).length >= total;

/** 도감에서 이 종류를 하나라도 정화했나 */
export function purifiedKinds(cleared: ReadonlySet<string>): Set<string> {
  const out = new Set<string>();
  for (const token of cleared) {
    const k = mobKindOfToken(token);
    if (mobKindById(k)) out.add(k);
  }
  return out;
}
