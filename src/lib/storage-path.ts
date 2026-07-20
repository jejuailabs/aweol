/**
 * Storage 주소에서 버킷 내부 경로를 뽑는다.
 *
 * 주소 형태가 두 가지다.
 *   1) https://storage.googleapis.com/<bucket>/<path>            (makePublic 으로 만든 것)
 *   2) https://firebasestorage.googleapis.com/v0/b/<bucket>/o/<path>?alt=media
 *                                                                (클라이언트 getDownloadURL)
 *
 * 주의: 2번 도메인이 1번 도메인을 **문자열로 포함한다**.
 * `storage.googleapis.com/...` 로 먼저 매칭하면 2번 주소에서 `b/<bucket>/o/<path>` 같은
 * 엉뚱한 경로가 나온다. 그래서 2번을 먼저 보고, 1번은 앞을 고정해서 본다.
 */
export function storagePathFromUrl(url: string): string {
  if (typeof url !== 'string' || !url) return '';

  // 2) firebasestorage 형태 — 경로가 %2F 로 인코딩돼 있다
  const fb = url.match(/firebasestorage\.googleapis\.com\/v0\/b\/[^/]+\/o\/([^?]+)/);
  if (fb) return decodeURIComponent(fb[1]);

  // 1) 공개 GCS 형태 — 반드시 // 뒤에 바로 오는 경우만
  const gcs = url.match(/^https?:\/\/storage\.googleapis\.com\/[^/]+\/([^?]+)/);
  if (gcs) return decodeURIComponent(gcs[1]);

  return '';
}
