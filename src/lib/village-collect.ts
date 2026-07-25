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
export const PER_SPOT = 8;

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
    // 학교 앞마당
    || (Math.abs(x) < 26 && Math.abs(z) < 34);

  /** 해안선 점을 다 펼쳐 둔다 — 바닷가 것을 놓을 때 골라 쓴다 */
  const shorePts = (coast ?? []).flat();

  const pool = COLLECT_KINDS.filter((k) => !k.spots || k.spots.includes(spotId));
  const out: CollectItem[] = [];

  // 넉넉히 돌면서 자리를 찾는다 — 막힌 자리는 건너뛴다
  for (let i = 0; out.length < PER_SPOT && i < 400; i++) {
    const s = base + i * 7919;
    const kind = pool[Math.floor(seeded(s) * pool.length) % pool.length];

    let x: number;
    let z: number;

    if (kind.shore && shorePts.length > 0) {
      // 해안선 한 점을 골라 그 둘레에 흩는다
      const p = shorePts[Math.floor(seeded(s + 1) * shorePts.length) % shorePts.length];
      const a = seeded(s + 2) * Math.PI * 2;
      const r = 4 + seeded(s + 3) * 16;
      x = Math.round(p[0] + Math.cos(a) * r);
      z = Math.round(p[1] + Math.sin(a) * r);
    } else {
      const R = radius * 0.82;
      x = Math.round((seeded(s + 1) - 0.5) * R * 2);
      z = Math.round((seeded(s + 2) - 0.5) * R * 2);
    }

    if (Math.abs(x) > radius || Math.abs(z) > radius) continue;
    if (blocked(x, z)) continue;
    // 서로 너무 붙어 있으면 한 자리에서 다 주워진다
    if (out.some((o) => Math.hypot(o.x - x, o.z - z) < 40)) continue;

    out.push({ id: `${spotId}-${out.length}-${kind.id}`, kind, x, z });
  }

  return out;
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
