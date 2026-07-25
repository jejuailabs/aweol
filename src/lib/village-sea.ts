/**
 * 바다가 어디인가 — **밀어내지 말고, 어느 쪽인지 물어본다.**
 *
 * ---
 *
 * **처음 만든 것이 틀렸다.** 해안선 마디마다 바다 방향으로 2.4km 씩 밀어내
 * 사각형을 이어 붙였다. 곧게 뻗은 해안에서는 맞는데, **만이나 항구처럼 굽은
 * 데서는 그 마디의 바다 방향이 뭍 안쪽을 향한다.** 애월리는 애월항이 있어서
 * 그렇게 밀어낸 조각들이 **마을 전체를 덮어버렸다.**
 *
 * 그때 "바다 쪽 법선이 75% 북향" 이라는 숫자를 보고 "만과 곶이 있으니
 * 정상" 이라고 넘어갔는데, 나머지 25% 가 **육지를 쓸고 지나간다**는 뜻이었다.
 * 재는 것을 골라야 한다 — 방향만 재고 **덮은 넓이를 안 쟀다.**
 *
 * ---
 *
 * **지금 방식.** 마을을 네모 칸으로 잘라, 칸마다 *가장 가까운 해안선 마디*를
 * 찾고 그 마디의 **어느 쪽**에 있는지 본다(오른쪽이 바다). 만이든 항구든
 * 가장 가까운 해안선이 답을 준다 — 굽은 모양에 흔들리지 않는다.
 *
 * 칸이라 물가가 조금 각지지만, 그 위에 백사장 띠를 덮으므로 눈에 안 띈다.
 */

export type XZ = [number, number];

export interface SeaMask {
  /** 칸 한 변 (미터) */
  cell: number;
  /** 칸 개수 */
  nx: number;
  nz: number;
  /** 왼쪽 위 칸의 좌표 */
  minX: number;
  minZ: number;
  /** 1 이면 바다 */
  mask: Uint8Array;
}

/** 점에서 선분까지 거리의 제곱과, 어느 쪽인지 */
function segSide(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz;
  let t = len2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = ax + dx * t;
  const cz = az + dz * t;
  const ex = px - cx;
  const ez = pz - cz;
  /**
   * 어느 쪽인가 — 진행 방향 `d` 와 점까지 벡터의 외적.
   *
   * 우리 좌표는 x=동, z=**남** 이다(위도를 뒤집었다). 이 평면에서
   * `cross = dx*ez - dz*ex` 가 양수면 진행 방향 **오른쪽**,
   * 곧 OSM 규칙으로 **바다**다.
   */
  const cross = dx * (pz - az) - dz * (px - ax);
  return { d2: ex * ex + ez * ez, sea: cross > 0 };
}

/**
 * 바다 칸 표를 만든다.
 *
 * 해안선이 없으면 `null` — 뭍 마을에는 바다를 그리지 않는다.
 * `cell` 이 작을수록 물가가 매끈하지만 계산이 는다.
 */
export function seaMask(
  coast: XZ[][] | undefined,
  radius: number,
  cell = 16
): SeaMask | null {
  if (!coast?.length) return null;

  /** 선분들을 펼쳐 둔다 */
  const segs: number[] = [];
  for (const line of coast) {
    for (let i = 0; i < line.length - 1; i++) {
      segs.push(line[i][0], line[i][1], line[i + 1][0], line[i + 1][1]);
    }
  }
  if (segs.length === 0) return null;

  // 마을보다 조금 넓게 — 끝이 뚝 끊겨 보이지 않게 한다
  const half = radius * 1.25;
  const nx = Math.ceil((half * 2) / cell);
  const nz = nx;
  const minX = -half;
  const minZ = -half;
  const mask = new Uint8Array(nx * nz);

  for (let iz = 0; iz < nz; iz++) {
    const pz = minZ + (iz + 0.5) * cell;
    for (let ix = 0; ix < nx; ix++) {
      const px = minX + (ix + 0.5) * cell;

      let best = Infinity;
      let bestSea = false;
      for (let s = 0; s < segs.length; s += 4) {
        const r = segSide(px, pz, segs[s], segs[s + 1], segs[s + 2], segs[s + 3]);
        if (r.d2 < best) { best = r.d2; bestSea = r.sea; }
      }
      if (bestSea) mask[iz * nx + ix] = 1;
    }
  }

  return { cell, nx, nz, minX, minZ, mask };
}

/** 이 자리가 바다인가 */
export function isSea(m: SeaMask | null, x: number, z: number): boolean {
  if (!m) return false;
  const ix = Math.floor((x - m.minX) / m.cell);
  const iz = Math.floor((z - m.minZ) / m.cell);
  if (ix < 0 || iz < 0 || ix >= m.nx || iz >= m.nz) return false;
  return m.mask[iz * m.nx + ix] === 1;
}

/** 바다 칸이 전체의 몇 할인가 — 검증에 쓴다 */
export function seaRatio(m: SeaMask | null): number {
  if (!m) return 0;
  let n = 0;
  for (let i = 0; i < m.mask.length; i++) n += m.mask[i];
  return n / m.mask.length;
}

/**
 * 바다 칸을 **가로줄로 묶어** 사각형 목록을 만든다.
 *
 * 칸 하나하나를 그리면 수만 개가 된다. 한 줄에서 이어진 칸을 하나로 묶으면
 * 몇백 개로 준다 — 3D 도 지도도 이걸 쓴다.
 */
export function seaRects(m: SeaMask | null): { x: number; z: number; w: number; d: number }[] {
  if (!m) return [];
  const out: { x: number; z: number; w: number; d: number }[] = [];
  for (let iz = 0; iz < m.nz; iz++) {
    let run = -1;
    for (let ix = 0; ix <= m.nx; ix++) {
      const on = ix < m.nx && m.mask[iz * m.nx + ix] === 1;
      if (on && run < 0) run = ix;
      if (!on && run >= 0) {
        out.push({
          x: m.minX + run * m.cell,
          z: m.minZ + iz * m.cell,
          w: (ix - run) * m.cell,
          d: m.cell,
        });
        run = -1;
      }
    }
  }
  return out;
}
