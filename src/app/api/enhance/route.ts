import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * 작품 사진 AI 보정 (비파괴 방식)
 * 생성형 AI로 다시 그리지 않고, 원본 픽셀을 기반으로 한 결정론적 보정만 수행한다:
 * - EXIF 회전 정상화
 * - 히스토그램 정규화 (조명이 어둡거나 뿌연 사진의 명암 복원)
 * - 미세한 채도/밝기 보정 (실물 색감 복원 수준)
 * - 언샤프 마스크 (선예도 — 손떨림/초점 흐림 완화)
 * - 과도한 해상도 축소 (최대 2000px, 용량 절약)
 */
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

    const enhanced = await sharp(input)
      .rotate() // EXIF 방향 정상화
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
