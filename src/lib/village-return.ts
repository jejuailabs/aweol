'use client';

/**
 * 들어가기 전에 서 있던 자리.
 *
 * **나오면 들어간 문 앞이어야 한다.**
 *
 * 그동안은 마을에 들어설 때마다 늘 학교 앞(0, 30)에 세웠다. 그래서 곽지
 * 끝자락 식당에 들어갔다가 나오면 **학교 앞이었다.** 다시 그 식당까지
 * 걸어가야 했고, 옆 가게를 마저 보려던 아이는 거기서 그만뒀다.
 *
 * ---
 *
 * **세션 저장소에 둔다.**
 *
 * 문서로 남길 값이 아니다 — 탭을 닫으면 없어져야 맞고, 남겨봤자 다음 날
 * "어제 서 있던 자리" 로 시작하는 것은 오히려 이상하다. 읽기 요금도 안 든다.
 *
 * **자리(spot)마다 따로 적는다.** 하나로 두면 곽지에서 들어갔다가 애월리로
 * 돌아올 때 곽지 좌표에 세워져 바다 한가운데 서 있게 된다.
 */

const KEY = 'aewol.village.return';
/** 어느 자리에서 들어갔나 — 나갈 때 그 자리로 돌려보내려고 따로 적는다 */
const SPOT_KEY = 'aewol.village.spot';

export interface ReturnSpot {
  x: number;
  z: number;
  yaw: number;
}

type Bag = Record<string, ReturnSpot>;

const read = (): Bag => {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Bag) : {};
  } catch {
    return {};
  }
};

/** 문에 들어가기 직전에 부른다 */
export function saveReturn(spotId: string, x: number, z: number, yaw: number) {
  if (typeof window === 'undefined' || !spotId) return;
  if (!Number.isFinite(x) || !Number.isFinite(z)) return;
  try {
    const bag = read();
    bag[spotId] = { x, z, yaw: Number.isFinite(yaw) ? yaw : 0 };
    sessionStorage.setItem(KEY, JSON.stringify(bag));
    sessionStorage.setItem(SPOT_KEY, spotId);
  } catch {
    // 저장 못 해도 놀이는 그대로 간다 — 학교 앞에서 시작할 뿐이다
  }
}

/**
 * 지금 있는 자리를 적어 둔다 — **마을에 서 있는 동안 늘.**
 *
 * 문으로 들어갈 때만 적었더니, 수첩처럼 **문을 거치지 않고 나가는 길**에서
 * 어긋났다. 애월리에서 수첩을 열고 '마을로' 를 누르면 아까 다녀온 곽지로
 * 끌려갔다. 서 있는 동안 계속 맞춰두면 어느 길로 나가도 제자리다.
 */
export function saveSpot(spotId: string) {
  if (typeof window === 'undefined' || !spotId) return;
  try {
    sessionStorage.setItem(SPOT_KEY, spotId);
  } catch {}
}

/**
 * 나갈 때 돌아갈 주소.
 *
 * **`/village` 로만 나가면 안 된다.** 그건 늘 집 자리(애월리)로 간다 —
 * 곽지 끝자락 식당에 들어갔다 나오면 애월리 학교 앞이었다. 자리가 셋인데
 * 나가는 문은 하나뿐이었던 셈이다.
 *
 * 기관·유적 화면은 자기가 어느 자리에서 열렸는지 모른다(주소에 기관 종류만
 * 있다). 그래서 들어갈 때 적어 둔 것을 여기서 읽는다.
 */
export function villageHref(): string {
  if (typeof window === 'undefined') return '/village';
  try {
    const spot = sessionStorage.getItem(SPOT_KEY);
    /*
      집 자리든 아니든 **그냥 적는다.** `?spot=` 은 어느 자리든 제대로 풀리고
      (그 학교 자리가 아니면 마을 화면이 알아서 집으로 돌린다),
      집 자리 이름을 여기 박아두면 학교가 늘 때마다 틀린다.
    */
    return spot ? `/village?spot=${encodeURIComponent(spot)}` : '/village';
  } catch {
    return '/village';
  }
}

/**
 * 돌아왔을 때 설 자리 — **읽기와 지우기를 갈랐다.**
 *
 * 처음엔 꺼내면서 지우는 `takeReturn` 하나였고, 화면이 그리는 중에 불렀다.
 * 그런데 React 는 (Suspense·동시 렌더링 때문에) **첫 그리기를 버리고 다시
 * 그릴 수 있다** — 첫 호출이 이미 지워버려서 두 번째 그리기는 빈손이었고,
 * 보건소에 들어갔다 나오면 죄다 학교 앞이었다. 그리는 중에는 읽기만 하고,
 * 지우는 것은 화면이 선 다음(effect)에 한다.
 */
export function peekReturn(spotId: string): ReturnSpot | null {
  if (typeof window === 'undefined' || !spotId) return null;
  try {
    return read()[spotId] ?? null;
  } catch {
    return null;
  }
}

/** 자리를 잡았으면 표를 지운다 — 안 지우면 새로고침마다 그 자리로 끌려간다 */
export function clearReturn(spotId: string) {
  if (typeof window === 'undefined' || !spotId) return;
  try {
    const bag = read();
    if (!(spotId in bag)) return;
    delete bag[spotId];
    sessionStorage.setItem(KEY, JSON.stringify(bag));
  } catch {}
}
