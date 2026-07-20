/**
 * 업로드 이미지 압축.
 *
 * gpt-image-2 가 뱉는 PNG 는 1MB 를 훌쩍 넘는다. 학교 대표 이미지는 3D 학교 화면을
 * 열 때마다 내려받으므로(현판 텍스처 + 색 추출) 그대로 두면 방문 수만큼 egress 가 나간다.
 * 가로 1024 / JPEG 82 로만 줄여도 보통 90% 가까이 준다.
 */

export interface Compressed {
  buffer: Buffer;
  contentType: string;
  ext: string;
}

export async function compressImage(
  input: Buffer,
  maxWidth = 1024,
  quality = 82
): Promise<Compressed> {
  try {
    // sharp 는 네이티브 모듈이라 실패할 수 있다. 실패하면 원본을 그대로 쓴다 —
    // 압축 때문에 학교 만들기가 통째로 막히면 안 된다.
    const { default: sharp } = await import('sharp');
    const out = await sharp(input)
      .rotate() // EXIF 방향 반영 (폰 사진이 눕는 걸 막는다)
      .resize({ width: maxWidth, withoutEnlargement: true })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();
    // 늘어났으면 원본이 낫다 (이미 잘 압축된 JPEG 인 경우)
    if (out.length >= input.length) {
      return { buffer: input, contentType: 'image/jpeg', ext: 'jpg' };
    }
    return { buffer: out, contentType: 'image/jpeg', ext: 'jpg' };
  } catch {
    return { buffer: input, contentType: 'image/png', ext: 'png' };
  }
}
