/**
 * 브라우저에서 이미지 줄이기.
 *
 * 3D 전시실은 액자마다 사진을 텍스처로 올린다. 원본(폰 사진 3~8MB)을 그대로 쓰면
 * 액자 12개짜리 방 하나가 20MB를 넘어, 집에서 열면 한참 빈 액자만 보인다.
 * 올릴 때 작은 판을 하나 더 만들어 두고, 전시실에서는 그걸 쓴다.
 *
 * 서버가 아니라 브라우저에서 줄이는 이유: 원본을 서버로 한 번 보냈다가 받는 왕복이 없고,
 * 업로드 자체도 가벼워진다.
 */

/** 전시실 액자용 — 이 정도면 3D 안에서 충분히 선명하다 */
export const THUMB_MAX = 640;

export interface ResizedImage {
  blob: Blob;
  width: number;
  height: number;
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/**
 * 긴 변을 maxSize 로 맞춰 JPEG 로 줄인다.
 * 실패하면 null — 호출부는 원본을 그대로 쓰면 된다. 썸네일 때문에 업로드가 막히면 안 된다.
 */
export async function resizeImage(
  source: Blob,
  maxSize = THUMB_MAX,
  quality = 0.82
): Promise<ResizedImage | null> {
  if (typeof document === 'undefined') return null;

  const url = URL.createObjectURL(source);
  try {
    const img = await loadImage(url);
    if (!img || !img.width || !img.height) return null;

    const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
    // 원본이 이미 작으면 굳이 다시 만들지 않는다
    if (scale === 1 && source.size < 300 * 1024) return null;

    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, w, h);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', quality)
    );
    if (!blob) return null;
    return { blob, width: w, height: h };
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}
