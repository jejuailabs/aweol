/**
 * 건물 충돌 — **다각형을 작은 네모로 쪼갠다.**
 *
 * 그동안은 건물 다각형을 **감싸는 네모 하나**(AABB)로 막았다. 정사각 건물은
 * 맞아떨어지지만, **비스듬히 선 건물**은 그 네모가 빈 땅까지 덮는다.
 *
 * 실측(구운 마을 그대로):
 *   애월 40%, 한담 49%, 곽지 56% — **막힌 넓이의 절반이 빈 땅이었다.**
 *   한담에는 75×66m 네모가 실제 1,996㎡ 건물 하나를 감싸고 있었다
 *   (나머지 2,900㎡ 는 아무것도 없는 풀밭인데 못 지나간다).
 *
 * "아무것도 없는데 막혀서 옆으로 돌아가야 한다" 는 증상이 이것이다.
 *
 * ---
 *
 * **바다와 같은 방법으로 푼다.**
 *
 * `village-sea.ts` 가 바다를 격자로 칠하고 가로줄로 묶어 네모를 만든다.
 * 여기도 똑같이 한다 — 다각형 안쪽 칸만 칠하고, 한 줄로 이어진 칸들을
 * 네모 하나로 묶는다. 네모 수는 늘지만 충돌 판정은 네모 하나에
 * 뺄셈 두 번이라 수백 개라도 티가 안 난다.
 */

export interface Block {
  x: number;
  z: number;
  halfW: number;
  halfD: number;
}

/**
 * 칸 크기 (미터).
 *
 * 작을수록 건물 모양에 꼭 맞지만 네모가 많아진다. 3m 면 아이 몸(반지름 0.28m)
 * 기준으로 벽에 바짝 붙는 느낌이 나면서도 네모 수가 감당할 만하다.
 */
const CELL = 3;

/** 점이 다각형 안인가 — 반직선 교차 세기 */
function inside(px: number, pz: number, poly: [number, number][]): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if ((zi > pz) !== (zj > pz) && px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi) {
      hit = !hit;
    }
  }
  return hit;
}

/**
 * 건물 하나를 네모 여럿으로.
 *
 * **칸 가운데가 다각형 안이면 칠한다.** 가장자리 칸이 반쯤 걸치는 것은
 * 그냥 둔다 — 벽에 1.5m 못 붙는 것과, 없는 벽에 막히는 것 중에는
 * 앞엣것이 낫다.
 */
export function blocksOfPolygon(poly: [number, number][]): Block[] {
  if (poly.length < 3) return [];

  const xs = poly.map((p) => p[0]);
  const zs = poly.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);

  const cols = Math.max(1, Math.ceil((maxX - minX) / CELL));
  const rows = Math.max(1, Math.ceil((maxZ - minZ) / CELL));

  /**
   * **작은 건물은 쪼개지 않는다.** 한 칸 남짓이면 네모 하나가 곧 그 건물이고,
   * 쪼개봤자 판정만 늘어난다.
   */
  if (cols <= 1 || rows <= 1) {
    return [{
      x: (minX + maxX) / 2,
      z: (minZ + maxZ) / 2,
      halfW: (maxX - minX) / 2,
      halfD: (maxZ - minZ) / 2,
    }];
  }

  const out: Block[] = [];

  for (let r = 0; r < rows; r++) {
    const cz = minZ + (r + 0.5) * CELL;
    let runStart = -1;

    /** 한 줄로 이어진 칸들을 네모 하나로 묶는다 */
    const flush = (endCol: number) => {
      if (runStart < 0) return;
      const x0 = minX + runStart * CELL;
      const x1 = minX + endCol * CELL;
      out.push({
        x: (x0 + x1) / 2,
        z: cz,
        halfW: (x1 - x0) / 2,
        halfD: CELL / 2,
      });
      runStart = -1;
    };

    for (let c = 0; c < cols; c++) {
      const cx = minX + (c + 0.5) * CELL;
      if (inside(cx, cz, poly)) {
        if (runStart < 0) runStart = c;
      } else {
        flush(c);
      }
    }
    flush(cols);
  }

  /**
   * 한 칸도 안 칠해졌으면(아주 얇고 긴 건물) 감싸는 네모로 되돌린다.
   * 안 그러면 그 건물은 **통과된다** — 없는 벽보다 나쁜 것은 뚫리는 벽이다.
   */
  if (out.length === 0) {
    return [{
      x: (minX + maxX) / 2,
      z: (minZ + maxZ) / 2,
      halfW: (maxX - minX) / 2,
      halfD: (maxZ - minZ) / 2,
    }];
  }

  return out;
}

/** 마을의 모든 건물을 네모 목록으로 */
export function blocksOfBuildings(buildings: { p: [number, number][] }[]): Block[] {
  const out: Block[] = [];
  for (const b of buildings) out.push(...blocksOfPolygon(b.p));
  return out;
}
