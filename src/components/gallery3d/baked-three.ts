/**
 * baked 의 three 쪽 절반 — 지오메트리에 정점 색을 실제로 새기는 도구.
 * 산수는 전부 `lib/baked.ts` 에 있고(검증됨), 여기는 그걸 buffer 에 옮겨 적을 뿐이다.
 *
 * 쓰는 법: 재질은 `BAKED_MAT`(unlit) 하나만 쓰고, 색은 지오메트리에 굽는다.
 * 조명이 없어도 그려지므로 씬의 조명은 아바타(표준 재질) 몫으로만 남긴다.
 */
import * as THREE from 'three';
import { lightRGB, shadowFactor, shadeRGB, hexToRGB, type Occluder } from '@/lib/baked';

/** 구운 지오메트리가 다 같이 쓰는 unlit 재질. 만들 필요도 버릴 필요도 없다. */
export const BAKED_MAT = new THREE.MeshBasicMaterial({ vertexColors: true });

/**
 * matcap — 캐릭터·소품용. 카메라 기준 노멀로 미리 그린 구에서 색을 읽는다
 * (브루노 1번 트릭). 조명이 없어도 도자기 같은 윤기가 난다.
 * 텍스처는 파일이 아니라 **캔버스로 한 번 그려** 모든 재질이 나눠 쓴다.
 */
let matcapTex: THREE.Texture | null = null;
export function getMatcap(): THREE.Texture {
  if (matcapTex) return matcapTex;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const g = cv.getContext('2d')!;
  /**
   * 좌상단 따뜻한 하이라이트 → 우하단 차가운 그늘.
   *
   * 처음엔 회백색으로 순하게 그렸다가 **화면이 하나도 안 바뀌어 보였다** —
   * 밝은 파스텔 벽에 순한 matcap 을 곱하면 이전 조명과 구분이 안 된다.
   * 명암 낙차를 크게 잡아야 형태가 산다. 톤이 과하면 여기 숫자만 만지면
   * 전 화면이 한 번에 바뀐다.
   */
  const lin = g.createLinearGradient(24, 12, 236, 252);
  lin.addColorStop(0, '#FFFDF2');
  lin.addColorStop(0.38, '#E9DCC6');
  lin.addColorStop(0.72, '#B0A7B4');
  lin.addColorStop(1, '#6E6C92');
  g.fillStyle = lin;
  g.fillRect(0, 0, 256, 256);
  const hi = g.createRadialGradient(88, 76, 4, 88, 76, 78);
  hi.addColorStop(0, 'rgba(255,255,255,1)');
  hi.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = hi;
  g.beginPath(); g.arc(128, 128, 128, 0, Math.PI * 2); g.fill();
  const rim = g.createRadialGradient(196, 206, 16, 196, 206, 130);
  rim.addColorStop(0, 'rgba(58,62,110,0.72)');
  rim.addColorStop(1, 'rgba(58,62,110,0)');
  g.fillStyle = rim;
  g.beginPath(); g.arc(128, 128, 128, 0, Math.PI * 2); g.fill();
  matcapTex = new THREE.CanvasTexture(cv);
  matcapTex.colorSpace = THREE.SRGBColorSpace;
  return matcapTex;
}

/**
 * 지오메트리에 기본색 × 조명을 정점 색으로 굽는다.
 *
 * 인덱스가 있으면 면이 색을 나눠 가져 얼룩지므로 펼친다(toNonIndexed).
 * `yaw` 는 이 지오메트리가 세계에서 Y축으로 얼마나 돌아 서는가 —
 * 돌려 세운 건물의 해 든 면이 실제 해 방향과 맞게 한다.
 * 원본은 건드리지 않고 새 지오메트리를 준다. 버리는 건 부르는 쪽 몫.
 */
export function bakeGeometry(
  geo: THREE.BufferGeometry,
  colorHex: number,
  { yaw = 0 }: { yaw?: number } = {}
): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  g.computeVertexNormals();
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  const col = new Float32Array(pos.count * 3);
  const base = hexToRGB(colorHex);
  const cos = Math.cos(yaw), sin = Math.sin(yaw);
  for (let i = 0; i < pos.count; i++) {
    const nx = nor.getX(i), ny = nor.getY(i), nz = nor.getZ(i);
    // Y축 회전을 노멀에 적용해 세계 기준 노멀로
    const wx = nx * cos + nz * sin;
    const wz = -nx * sin + nz * cos;
    const li = lightRGB(wx, ny, wz);
    col[i * 3] = base[0] * li[0];
    col[i * 3 + 1] = base[1] * li[1];
    col[i * 3 + 2] = base[2] * li[2];
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/**
 * 땅 판을 만들며 그림자를 굽는다.
 *
 * 단색 평면 대신 정점이 촘촘한 평면에, 가리개(건물·나무)가 드리우는
 * 그림자를 정점 색으로 새긴다. 반환된 지오메트리는 부르는 쪽이 버린다.
 */
/**
 * 굴곡 있는 땅(오름)을 만들며 명암·그림자를 굽는다.
 *
 * `heightAt` 으로 정점을 세우고, 지형 노멀로 해 든 비탈/그늘 비탈을 나눈 뒤
 * `colorAt` 이 준 기본색에 곱한다. 로드할 때 한 번 — 런타임 비용 0.
 */
export function bakeTerrainGeometry({
  size, segments = 150, heightAt, colorAt, occluders = [],
}: {
  size: number;
  segments?: number;
  heightAt: (x: number, z: number) => number;
  /** (x, z, h, slope) → 기본색 0~1 RGB */
  colorAt: (x: number, z: number, h: number, slope: number) => readonly [number, number, number];
  occluders?: readonly Occluder[];
}): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(size, size, segments, segments);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const e = 0.9;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = heightAt(x, z);
    pos.setY(i, h);
    // 지형 노멀 (유한차분) — 해 든 비탈과 그늘 비탈이 갈린다
    const hx = (heightAt(x + e, z) - heightAt(x - e, z)) / (2 * e);
    const hz = (heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e);
    const inv = 1 / Math.hypot(hx, 1, hz);
    const li = lightRGB(-hx * inv, inv, -hz * inv);
    const base = colorAt(x, z, h, Math.hypot(hx, hz));
    const c = shadeRGB(
      [base[0] * li[0], base[1] * li[1], base[2] * li[2]],
      shadowFactor(occluders, x, z)
    );
    col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

export function bakeGroundGeometry({
  size, segments = 96, colorHex, occluders,
}: {
  size: number;
  segments?: number;
  colorHex: number;
  occluders: readonly Occluder[];
}): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(size, size, segments, segments);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const base = hexToRGB(colorHex);
  /**
   * 땅에는 조명 곱을 **안 한다.** lightRGB(위쪽)≈1.14 를 곱했더니
   * 초록이 하얗게 바래서 지정한 색이 화면에 안 나왔다.
   * 땅 색은 아트가 고른 그 색 그대로 나가고, 그림자만 얹는다.
   */
  const lit: [number, number, number] = [base[0], base[1], base[2]];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const c = shadeRGB(lit, shadowFactor(occluders, x, z));
    // 잔디의 보슬보슬한 점무늬도 정점에 굽는다 — 텍스처 없이 한 경로로 간다
    const w = (Math.sin(x * 1.7) * Math.cos(z * 1.9) + Math.sin((x - z) * 2.3)) * 0.016;
    col[i * 3] = c[0] + w; col[i * 3 + 1] = c[1] + w; col[i * 3 + 2] = c[2] + w;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
