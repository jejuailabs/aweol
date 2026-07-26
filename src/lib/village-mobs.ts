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

/** 한 자리에 두는 수. 너무 많으면 마을이 쓰레기장이 되고, 적으면 만날 일이 없다. */
export const MOBS_PER_SPOT = 12;

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
 * 줍기와 **같은 방식이되 씨앗을 달리 탄다**(`:mob` 을 덧붙인다).
 * 같은 씨앗을 쓰면 소라와 폐그물이 늘 같은 자리에 겹쳐 선다.
 *
 * **건물 안과 학교 앞마당은 뺀다.** 벽 속에 있으면 못 베고,
 * 앞마당에 쓰레기 괴물이 서 있으면 그것대로 이상하다.
 *
 * 우두머리는 **끝에 몰아서 놓는다** — 자리마다 반드시 둘이 되도록.
 * 섞어서 뽑으면 어떤 마을에는 우두머리가 하나도 없다.
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
    // 학교 앞마당
    || (Math.abs(x) < 26 && Math.abs(z) < 34);

  /** 해안선 점들 — 바다 것을 놓을 때 골라 쓴다 */
  const shorePts = (coast ?? []).flat();
  const hasShore = shorePts.length > 0;

  const normals = MOB_KINDS.filter((k) => k.tier === 'normal' && (hasShore || !k.shore));
  const bosses = MOB_KINDS.filter((k) => k.tier === 'boss' && (hasShore || !k.shore));

  const out: Mob[] = [];

  /** 한 마리를 놓아 본다. 자리가 안 되면 false. */
  const place = (kind: MobKind, s: number): boolean => {
    let x: number;
    let z: number;

    if (kind.shore && hasShore) {
      const p = shorePts[Math.floor(seeded(s + 1) * shorePts.length) % shorePts.length];
      const a = seeded(s + 2) * Math.PI * 2;
      const r = 5 + seeded(s + 3) * 18;
      x = Math.round(p[0] + Math.cos(a) * r);
      z = Math.round(p[1] + Math.sin(a) * r);
    } else {
      const R = radius * 0.82;
      x = Math.round((seeded(s + 1) - 0.5) * R * 2);
      z = Math.round((seeded(s + 2) - 0.5) * R * 2);
    }

    if (Math.abs(x) > radius || Math.abs(z) > radius) return false;
    if (blocked(x, z)) return false;
    // 서로 너무 붙어 있으면 한 번 휘둘러 둘이 맞는다
    if (out.some((o) => Math.hypot(o.x - x, o.z - z) < 34)) return false;

    out.push({ id: `${spotId}-${out.length}-${kind.id}`, kind, x, z });
    return true;
  };

  const bossCount = Math.min(2, bosses.length);
  const normalCount = MOBS_PER_SPOT - bossCount;

  // 졸개 먼저
  for (let i = 0; out.length < normalCount && i < 500; i++) {
    const s = base + i * 7919;
    place(normals[Math.floor(seeded(s) * normals.length) % normals.length], s);
  }
  // 우두머리는 반드시 채운다
  for (let i = 0; out.length < normalCount + bossCount && i < 500; i++) {
    const s = base + 900_000 + i * 5717;
    place(bosses[Math.floor(seeded(s) * bosses.length) % bosses.length], s);
  }

  return out;
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
