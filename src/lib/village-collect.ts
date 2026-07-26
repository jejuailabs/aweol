/**
 * 마을에 숨은 것 줍기 — **뒷골목까지 걸어다닐 이유.**
 *
 * 지금 마을은 갈 곳이 정해져 있다. 심부름이 보내는 곳만 가면 되고,
 * 그 사이 골목은 지나치는 배경이다. **주울 것이 있으면 골목이 살아난다.**
 *
 * ---
 *
 * **주는 것은 도장이 아니라 도감이다.**
 *
 * 도장은 숙제를 해서 받는 것이다. 걸어다닌다고 도장이 나오면
 * **숙제한 아이가 손해**를 본다 — 이 프로젝트가 놀이 아이템 값을 싸게 잡은 것과
 * 같은 판단이다. 그래서 주워 모으는 것 자체가 상이고, 한 자리를 다 모으면
 * 뱃지를 준다. 도장은 **자리를 다 채웠을 때 한 번만**, 그것도 적게 준다.
 *
 * ---
 *
 * **자리는 씨앗으로 정한다.**
 *
 * 어디에 뭐가 있는지를 서버에 저장하면 아이 수 × 물건 수만큼 읽기가 든다.
 * 씨앗에서 계산하면 저장할 것이 없고, **누구에게나 같은 자리**에 있다 —
 * "저기 골목에 소라 있어" 가 친구끼리 통하는 말이 된다.
 */

/** 주울 수 있는 것 한 종류 */
export interface CollectKind {
  id: string;
  emoji: string;
  name: string;
  /** 도감에 적는 한 줄 — 주웠을 때 배우는 것 */
  note: string;
  /** 어느 자리에서 나오나. 비면 어디서나. */
  spots?: string[];
  /** 바닷가에서만 나오나 — 해안선 가까이에 놓는다 */
  shore?: boolean;
}

/**
 * 무엇을 줍나.
 *
 * **제주 바닷가와 마을에 실제로 있는 것들**로 골랐다. 지어낸 보물이 아니라
 * 나가서 진짜로 볼 수 있는 것이라야 도감이 뜻을 갖는다.
 */
export const COLLECT_KINDS: CollectKind[] = [
  {
    id: 'bomal',
    emoji: '🐌',
    name: '보말',
    note: '제주말로 고둥이에요. 갯바위에 붙어 살고, 보말죽·보말칼국수를 해 먹어요.',
    shore: true,
  },
  {
    id: 'sora',
    emoji: '🐚',
    name: '소라 껍데기',
    note: '해녀가 물질로 따는 것 중 하나예요. 껍데기에 뿔이 나 있어요.',
    shore: true,
  },
  {
    id: 'seaglass',
    emoji: '💎',
    name: '바다유리',
    note: '깨진 유리가 파도에 오래 구르면 모서리가 닳아 동글동글해져요. 바다가 다듬은 거예요.',
    shore: true,
  },
  {
    id: 'basalt',
    emoji: '🪨',
    name: '구멍 뚫린 돌',
    note: '현무암이에요. 용암 속 가스가 빠져나간 자리가 구멍으로 남았어요.',
  },
  {
    id: 'starfish',
    emoji: '⭐',
    name: '불가사리',
    note: '팔이 잘려도 다시 자라요. 조개를 많이 먹어서 어민들에게는 골칫거리이기도 해요.',
    shore: true,
  },
  {
    id: 'tangerine',
    emoji: '🍊',
    name: '떨어진 감귤',
    note: '제주 밭에서 가장 많이 나는 열매예요. 겨울에 노랗게 익어요.',
  },
  {
    id: 'feather',
    emoji: '🪶',
    name: '새 깃털',
    note: '바닷가에는 갈매기와 가마우지가 많아요. 깃털에 기름이 있어 물에 안 젖어요.',
  },
  {
    id: 'acorn',
    emoji: '🌰',
    name: '도토리',
    note: '납읍 난대림 같은 숲에 떨어져 있어요. 다람쥐가 겨울 먹이로 숨겨 둬요.',
  },
];

export const kindById = (id: string) => COLLECT_KINDS.find((k) => k.id === id);

/** 한 자리에 숨기는 개수. 너무 많으면 지겹고, 적으면 돌아다닐 이유가 안 된다. */
export const PER_SPOT = 12;

/** 처음 만나는 거리 — 시작하자마자 코앞이면 줍는 맛이 없다 */
export const NEAR_M = 10;
/** 서로 이만큼은 떨어뜨린다 — 한 자리에서 둘이 주워지면 안 된다 */
export const MIN_GAP = 14;
/** 눈에 들어오는 거리. 이 밖은 아예 안 그린다 — 멀리 것까지 다 띄우면 어수선하다. */
export const SHOW_RANGE = 70;

/** 한 자리를 다 모으면 받는 도장 — **적게.** 걷는 것이 숙제를 이기면 안 된다. */
export const STAMPS_PER_SPOT = 1;

/** 주우려면 이만큼 가까이 (미터) */
export const PICK_RADIUS = 3.2;

export interface CollectItem {
  /**
   * 기록에 쌓이는 값 — `{자리}-{번호}-{종류}` 다.
   *
   * **종류를 여기 같이 담는다.** 도감은 마을 데이터(건물·해안선)가 없는
   * 화면에서도 열린다. 번호만 적어 두면 그 번호가 무엇이었는지 알아내려고
   * 마을 파일을 다시 받아야 한다 — 도감 한 번 여는 값으로는 비싸다.
   *
   * 자리 이름과 종류 이름에는 `-` 를 쓰지 않는다(그래야 갈라 읽을 수 있다).
   */
  id: string;
  kind: CollectKind;
  x: number;
  z: number;
}

/** 기록 한 줄에서 종류를 되찾는다 */
export const kindOfToken = (token: string) => token.split('-').pop() ?? '';

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
 * 이 자리에 무엇이 어디 숨어 있나.
 *
 * **건물 안과 학교 앞마당은 뺀다.** 벽 속에 있으면 못 줍고,
 * 앞마당은 이미 볼 것이 많아 굳이 여기까지 둘 이유가 없다.
 *
 * 바닷가에서 나는 것(`shore`)은 **해안선 가까이**에 놓는다 —
 * 소라가 밭 한가운데 있으면 그게 더 이상하다.
 */
export function itemsOfSpot(
  spotId: string,
  radius: number,
  buildings: { p: [number, number][] }[],
  coast?: [number, number][][]
): CollectItem[] {
  const base = seedOf(spotId);

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
    // 시작 자리 둘레만 비운다 — 발밑에 있으면 걷기도 전에 다 주워진다
    || Math.hypot(x, z) < 6;

  const shorePts = (coast ?? []).flat();
  const hasShore = shorePts.length > 0;
  /**
   * 바닷가로 치는 거리.
   *
   * **넉넉히 잡는다(55m).** 30m 로 좁혔더니 바닷가로 세어지는 자리가 자리마다
   * 두어 개뿐이어서, 바닷가 것 넷 중 **둘이 어느 자리에도 안 나왔다** —
   * 도감을 영영 못 채우는 막다른 길이다. 해안에서 쉰 걸음이면 아직 바닷가다.
   */
  const atShore = (x: number, z: number) =>
    hasShore && shorePts.some((p) => Math.hypot(p[0] - x, p[1] - z) < 55);

  /**
   * 가장 먼 것이 놓이는 거리 — **마을 끝까지 펴지 않는다.**
   * 몹과 같은 이유다(`village-mobs.ts` 참고): 반지름 830m 에 열두 개를
   * 늘어놓으면 백오십 걸음에 하나씩이라 걸어도 안 나온다.
   */
  const FAR = Math.min(radius * 0.5, 260);
  /** 황금각 — 한쪽으로 몰리지 않게 방향을 돌린다 */
  const GOLDEN = Math.PI * (3 - Math.sqrt(5));

  const fits = (x: number, z: number, taken: { x: number; z: number }[]) =>
    Math.abs(x) <= radius && Math.abs(z) <= radius
    && !blocked(x, z)
    && !taken.some((o) => Math.hypot(o.x - x, o.z - z) < MIN_GAP);

  // ---- 1) 자리부터. 가까운 것 → 먼 것 (몹과 같은 방식) ----
  const spots: { x: number; z: number }[] = [];
  for (let slot = 0; slot < PER_SPOT; slot++) {
    const t = slot / Math.max(1, PER_SPOT - 1);
    const target = NEAR_M + Math.pow(t, 1.35) * (FAR - NEAR_M);

    let done = false;
    for (let k = 0; k < 80 && !done; k++) {
      const s = base + slot * 7919 + k * 131;
      // 몹과 **반대로 돌린다** — 같은 각으로 깔면 소라 옆에 늘 폐그물이 선다
      const ang = -GOLDEN * slot + (seeded(s) - 0.5) * 1.2 + 1.7;
      const r = target * (0.86 + seeded(s + 1) * 0.28);
      const x = Math.round(Math.cos(ang) * r);
      const z = Math.round(Math.sin(ang) * r);
      if (!fits(x, z, spots)) continue;
      spots.push({ x, z });
      done = true;
    }
    // 수는 반드시 채운다 — 모자라면 영영 다 못 모아 상을 못 받는다
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
  /**
   * **돌려가며 뽑는다.** 아무 종류나 뽑으면 같은 것만 나와서
   * 도감에 영영 안 채워지는 종류가 생긴다(실측: 여덟 중 셋이 안 나왔다).
   */
  const pool = COLLECT_KINDS.filter((k) => !k.spots || k.spots.includes(spotId));
  const turn = new Map<string, number>();
  const nextOf = (key: string, use: CollectKind[]) => {
    const n = turn.get(key) ?? Math.floor(seeded(base + seedOf(key)) * use.length);
    turn.set(key, n + 1);
    return use[n % use.length];
  };

  return spots.map((p, i) => {
    const sea = atShore(p.x, p.z);
    const fit = pool.filter((k) => !!k.shore === sea);
    const use = fit.length ? fit : pool;
    const kind = nextOf(String(sea), use);
    return { id: `${spotId}-${i}-${kind.id}`, kind, x: p.x, z: p.z };
  });
}

/** 진행 기록에서 이 자리를 다 모았나 */
export const spotDone = (spotId: string, picked: ReadonlySet<string>, total: number) =>
  total > 0 && Array.from(picked).filter((p) => p.startsWith(`${spotId}-`)).length >= total;

/** 도감에서 이 종류를 하나라도 주웠나 */
export function foundKinds(
  picked: ReadonlySet<string>,
  itemsBySpot: Record<string, CollectItem[]>
): Set<string> {
  const out = new Set<string>();
  for (const [, items] of Object.entries(itemsBySpot)) {
    for (const it of items) if (picked.has(it.id)) out.add(it.kind.id);
  }
  return out;
}
