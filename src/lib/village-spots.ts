/**
 * 마을 스팟 — **하나로 이어붙이지 않고, 자리마다 따로 굽는다.**
 *
 * 애월읍은 동서로 10km가 넘는다. 이걸 끊김 없는 하나의 3D 지도로 만들면
 * 아이 기기에서 안 돌아가고, 무엇보다 **걸어서 갈 수 없는 거리**다
 * (한담까지 1km, 곽지까지 2km — 아이 걸음으로 지루하기만 하다).
 *
 * 그래서 사람이 실제로 가서 노는 **자리(spot)** 단위로 나눠 굽는다.
 * 자리 안에서는 걸어다니고, 자리와 자리 사이는 **맵 끝단의 화살표로 넘어간다.**
 * 새 자리를 늘리려면 이 표에 한 줄 쓰고 한 번 구우면 된다.
 *
 * ---
 *
 * **좌표는 실제 지도에서 가져온 것이다.**
 *
 * 이 프로젝트는 유적 이야기에서 이미 선을 그었다 — 지어내지 않는다.
 * 좌표는 더하다. 틀리면 **엉뚱한 동네가 우리 마을로 구워진다.**
 * 아래 값은 OpenStreetMap 에서 이름으로 찾아 확인한 것이고,
 * 출처를 `sourceNote` 에 적어 둔다.
 */

/** 8방위 — 화살표 표지판에 한글로 적는다 */
const DIR_LABEL: [number, string][] = [
  [0, '북'], [45, '북동'], [90, '동'], [135, '남동'],
  [180, '남'], [225, '남서'], [270, '서'], [315, '북서'],
];

export interface VillageSpot {
  /** 주소에 쓰는 값이자 표의 열쇠 (`/village?spot=gwakji`) */
  id: string;
  name: string;
  emoji: string;
  /** 한 줄로: 여기가 어떤 곳인가 */
  tagline: string;
  /** 실제 좌표 (OSM 확인) */
  lat: number;
  lng: number;
  /** 이 자리를 몇 미터까지 구울까 */
  radius: number;
  /** 이 자리가 뜨는 학교들 */
  schoolIds: string[];
  /**
   * **집이 되는 자리인가.** 학교가 서 있는 자리다.
   * 여기만 학교 건물·운동장이 뜨고, 나머지 자리에는 안 뜬다.
   */
  home?: boolean;
  /** 어디서 확인한 좌표인가 */
  sourceNote: string;
}

/**
 * 애월초등학교 아이들이 갈 수 있는 자리들.
 *
 * **셋으로 시작한다.** 열 곳을 얕게 만들면 어느 곳도 볼 것이 없다 —
 * 기관 표를 만들 때와 같은 판단이다.
 */
export const VILLAGE_SPOTS: VillageSpot[] = [
  {
    id: 'aewol',
    name: '애월리',
    emoji: '🏫',
    tagline: '우리 학교가 있는 마을. 읍사무소·우체국·농협이 모여 있어요.',
    lat: 33.4604899,
    lng: 126.3215217,
    radius: 800,
    schoolIds: ['aewol-elementary'],
    home: true,
    sourceNote: 'OpenStreetMap place=village 애월리',
  },
  {
    id: 'handam',
    name: '한담해변',
    emoji: '☕',
    tagline: '바다를 보며 걷는 산책로와 카페거리. 애월에서 서쪽으로 1km.',
    lat: 33.4610,
    lng: 126.3105,
    radius: 600,
    schoolIds: ['aewol-elementary'],
    sourceNote: 'OpenStreetMap 한담공원·카페거리(몽상드애월 등) 무리의 가운데',
  },
  {
    id: 'gwakji',
    name: '곽지과물해변',
    emoji: '🏖️',
    tagline: '모래가 곱고 물이 얕은 해수욕장. 용천수로 몸을 씻는 과물노천탕이 있어요.',
    lat: 33.4513,
    lng: 126.3047,
    radius: 800,
    schoolIds: ['aewol-elementary'],
    sourceNote: 'OpenStreetMap natural=beach 곽지과물 (33.451343, 126.3046849)',
  },
];

export const spotById = (id: string): VillageSpot | undefined =>
  VILLAGE_SPOTS.find((s) => s.id === id);

export const spotsOfSchool = (schoolId: string): VillageSpot[] =>
  VILLAGE_SPOTS.filter((s) => s.schoolIds.includes(schoolId));

/** 그 학교의 집 자리 (학교가 서 있는 곳). 없으면 첫 번째. */
export const homeSpot = (schoolId: string): VillageSpot | undefined => {
  const list = spotsOfSchool(schoolId);
  return list.find((s) => s.home) ?? list[0];
};

const M_PER_DEG_LAT = 111320;

/**
 * 한 자리에서 다른 자리로 — **어느 쪽으로 몇 미터인가.**
 *
 * 화살표 표지판을 맵 끝단 어디에 세울지, 그리고 뭐라고 적을지가 여기서 나온다.
 * 3D 좌표계와 맞춘다: x 는 동쪽(+), z 는 **남쪽(+)** 이다
 * (마을을 구울 때 `z = -(위도차)` 로 뒤집었기 때문이다).
 */
export function spotVector(from: VillageSpot, to: VillageSpot): {
  /** 동쪽으로 몇 미터 (음수면 서쪽) */
  x: number;
  /** 남쪽으로 몇 미터 (음수면 북쪽) */
  z: number;
  /** 직선 거리 (미터) */
  dist: number;
  /** 북쪽을 0 으로 시계방향 각도 (도) */
  bearing: number;
  /** '서', '남서' 같은 한글 방위 */
  dirLabel: string;
  /** '1.0km' 처럼 아이가 읽을 거리 */
  distLabel: string;
} {
  const mPerDegLng = M_PER_DEG_LAT * Math.cos((from.lat * Math.PI) / 180);
  const x = (to.lng - from.lng) * mPerDegLng;
  const z = -(to.lat - from.lat) * M_PER_DEG_LAT;
  const dist = Math.hypot(x, z);

  // 북쪽(z 가 음수)을 0 도로, 시계방향
  let bearing = (Math.atan2(x, -z) * 180) / Math.PI;
  if (bearing < 0) bearing += 360;

  // 가장 가까운 8방위
  let best = DIR_LABEL[0];
  let bestDiff = 999;
  for (const d of DIR_LABEL) {
    const diff = Math.min(Math.abs(bearing - d[0]), 360 - Math.abs(bearing - d[0]));
    if (diff < bestDiff) { bestDiff = diff; best = d; }
  }

  return {
    x,
    z,
    dist,
    bearing,
    dirLabel: best[1],
    distLabel: dist >= 1000 ? `${(dist / 1000).toFixed(1)}km` : `${Math.round(dist / 10) * 10}m`,
  };
}

/**
 * 지금 자리에서 갈 수 있는 이웃들 — **맵 끝단 화살표 게이트.**
 *
 * 자리마다 이웃을 손으로 적지 않는다. 같은 학교의 다른 자리는 **전부** 이웃이다 —
 * 셋뿐인데 굳이 길을 막을 이유가 없고, 자리를 늘릴 때 표를 두 군데 고치게 하면
 * 반드시 한쪽이 낡는다.
 *
 * 게이트는 **그 방향의 맵 끝단**에 선다. 그래야 "서쪽으로 계속 걸어가면
 * 한담이 나온다" 가 몸으로 맞는 말이 된다.
 */
export function gatesFrom(spot: VillageSpot): {
  spot: VillageSpot;
  /** 3D 에 세울 자리 (미터) — 맵 끝단 */
  x: number;
  z: number;
  /** 표지판이 가리키는 쪽 (라디안, three 의 rotation.y) */
  yaw: number;
  dirLabel: string;
  distLabel: string;
}[] {
  return spotsOfSchool(spot.schoolIds[0] ?? '')
    .filter((s) => s.id !== spot.id)
    .map((s) => {
      const v = spotVector(spot, s);
      // 끝단 안쪽에 살짝 들여 세운다 — 딱 끝이면 아바타가 못 다가간다
      const edge = spot.radius * 0.88;
      const len = Math.hypot(v.x, v.z) || 1;
      return {
        spot: s,
        x: (v.x / len) * edge,
        z: (v.z / len) * edge,
        /**
         * 표지판이 그 자리를 **바라보게** 돌린다.
         * three 의 y 회전은 +z 를 앞으로 보므로 `atan2(x, z)` 다.
         */
        yaw: Math.atan2(v.x, v.z),
        dirLabel: v.dirLabel,
        distLabel: v.distLabel,
      };
    })
    .sort((a, b) => a.spot.name.localeCompare(b.spot.name));
}
