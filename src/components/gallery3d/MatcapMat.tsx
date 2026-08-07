'use client';

import { type ThreeElements } from '@react-three/fiber';
import { getMatcap } from './baked-three';

/**
 * 공용 matcap 재질 — 전 화면의 소품·건물·실내가 같이 쓴다.
 * (docs/10-jeju-warp-map.md — 브루노 케이스 스터디의 1번 트릭)
 *
 * 카메라 기준 노멀로 미리 그린 구에서 색을 읽으므로 **조명이 필요 없다.**
 * 조명 있는 화면에 섞여 있어도 똑같이 보이고, 그림자맵을 꺼도 입체감이 남는다.
 * roughness·metalness·emissive 는 matcap 이 대신하므로 받지 않아도 된다.
 */
export function MatcapMat(props: ThreeElements['meshMatcapMaterial']) {
  return <meshMatcapMaterial matcap={getMatcap()} {...props} />;
}
