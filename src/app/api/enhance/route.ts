import { NextRequest, NextResponse } from 'next/server';
import sharp, { type Sharp } from 'sharp';
import { findContentBox, scaleBox } from '@/lib/auto-crop';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * 작품 사진 AI 보정 (비파괴 방식)
 * 생성형 AI로 다시 그리지 않고, 원본 픽셀을 기반으로 한 결정론적 보정만 수행한다:
 * - EXIF 회전 정상화
 * - **작품만 남기고 책상·바닥 잘라내기** (아래 참고)
 * - 히스토그램 정규화 (조명이 어둡거나 뿌연 사진의 명암 복원)
 * - 미세한 채도/밝기 보정 (실물 색감 복원 수준)
 * - 언샤프 마스크 (선예도 — 손떨림/초점 흐림 완화)
 * - 과도한 해상도 축소 (최대 2000px, 용량 절약)
 */

/** 크롭 판정용으로 줄이는 크기. 작을수록 빠르고 잡티에 덜 흔들린다. */
const SCAN_MAX = 220;

/**
 * 작품 자리를 찾아 잘라낸다. 못 찾거나 자를 이유가 없으면 **원본 그대로**.
 *
 * 선생님은 25명 분을 책상에 놓고 연달아 찍는다. 그러면 사진마다 책상과 그림자가
 * 같이 들어와서, 그대로 걸면 액자에 책상이 전시된다.
 *
 * **실패하면 조용히 원본을 쓴다.** 잘못 자른 작품을 거는 것보다 안 자르는 게 낫고,
 * 크롭 때문에 업로드가 막히면 더 나쁘다.
 */
async function cropToArtwork(img: Sharp): Promise<Sharp> {
  try {
    const meta = await img.metadata();
    const W = meta.width ?? 0;
    const H = meta.height ?? 0;
    if (!W || !H) return img;

    // 판정은 작은 흑백 판에서 한다 (원본을 다 훑으면 느리고 얻는 것도 없다)
    const scan = await img
      .clone()
      .resize(SCAN_MAX, SCAN_MAX, { fit: 'inside', withoutEnlargement: true })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const box = findContentBox(
      new Uint8Array(scan.data.buffer, scan.data.byteOffset, scan.data.length),
      scan.info.width,
      scan.info.height
    );
    if (!box) return img;

    const full = scaleBox(box, { w: scan.info.width, h: scan.info.height }, { w: W, h: H });
    return img.extract(full);
  } catch {
    return img;
  }
}
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('image');
    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: 'image 필드가 필요합니다' }, { status: 400 });
    }
    if (file.size > 20 * 1024 * 1024) {
      return NextResponse.json({ error: '20MB 이하 이미지만 지원합니다' }, { status: 413 });
    }

    const input = Buffer.from(await file.arrayBuffer());

    /**
     * **회전을 먼저 확정한다.** EXIF 방향이 남아 있으면 좌표계가 어긋나서
     * 엉뚱한 자리를 잘라낸다(세로로 찍은 사진에서 특히).
     * 그래서 `rotate()` 결과를 한 번 굽고 나서 작품 자리를 찾는다.
     */
    const upright = sharp(await sharp(input).rotate().toBuffer());
    const cropped = await cropToArtwork(upright);

    const enhanced = await cropped
      .resize(2000, 2000, { fit: 'inside', withoutEnlargement: true })
      .normalize({ lower: 1, upper: 99 }) // 히스토그램 스트레치 — 조명 보정
      .modulate({ brightness: 1.03, saturation: 1.08 }) // 미세 밝기/채도 복원
      .sharpen({ sigma: 1.1, m1: 0.8, m2: 2 }) // 언샤프 마스크 — 선예도
      .jpeg({ quality: 90, mozjpeg: true })
      .toBuffer();

    return new NextResponse(new Uint8Array(enhanced), {
      status: 200,
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    console.error('enhance failed:', e);
    return NextResponse.json({ error: '보정에 실패했습니다' }, { status: 500 });
  }
}
