/**
 * 유튜브 주소 다루기.
 *
 * **썸네일을 우리가 저장하지 않는다.** `img.youtube.com` 이 CORS 를 열어둬서
 * 3D 액자 텍스처로 바로 쓸 수 있다 — 영상 작품은 저장 용량이 0 이다.
 * (사진 작품은 원본+썸네일 두 장을 Storage 에 올린다)
 */

/** 우리가 받는 주소 모양들 */
const PATTERNS: RegExp[] = [
  /(?:youtube\.com|youtube-nocookie\.com)\/watch\?(?:.*&)?v=([\w-]{11})/,
  /youtu\.be\/([\w-]{11})/,
  /(?:youtube\.com|youtube-nocookie\.com)\/(?:embed|v|shorts|live)\/([\w-]{11})/,
];

/**
 * 주소에서 영상 번호를 꺼낸다. 못 알아보면 null.
 *
 * 아이들은 앱에서 '공유 → 복사' 로 붙여넣기 때문에 `?si=...` 같은 게 붙어 온다.
 * 그래서 정확히 일치가 아니라 **주소 안에서 찾는다.**
 */
export function youtubeId(raw: string): string | null {
  const s = (raw || '').trim();
  if (!s) return null;
  // 번호만 그대로 붙여넣는 경우도 받아준다
  if (/^[\w-]{11}$/.test(s)) return s;
  for (const re of PATTERNS) {
    const m = s.match(re);
    if (m) return m[1];
  }
  return null;
}

/** 액자에 걸 그림. 우리 저장소를 안 쓴다. */
export function youtubeThumb(id: string): string {
  // maxres 는 없는 영상이 있어서 항상 있는 hq 를 쓴다
  return `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
}

/**
 * 재생 주소.
 *
 * `youtube-nocookie` 를 쓴다 — 아이들 화면이라 추적 쿠키를 덜 심는 쪽이 맞다.
 * `rel=0` 으로 끝난 뒤 남의 영상이 덜 뜨게 한다(완전히 막지는 못한다).
 */
export function youtubeEmbed(id: string): string {
  return `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1&playsinline=1`;
}
