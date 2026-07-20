import { NextRequest, NextResponse } from 'next/server';
import { verifyRequestUser, isStaffRole } from '@/lib/firebase-admin';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * 틀린그림 찾기용 변형 사진 만들기.
 *
 * 원본을 gpt-image-2 에 넣어 몇 군데만 바꾼 그림을 받는다.
 * **AI가 정확히 5군데를 바꿔주지는 않는다.** 그래서 여기서 나온 그림을 정답으로 삼지 않고,
 * 선생님이 두 그림을 보며 직접 다른 곳을 찍어 정답을 정한다(그게 유일하게 믿을 수 있는 기준이다).
 * 이 API 는 "그럴듯한 변형본"을 주는 데까지만 책임진다.
 */

const PROMPT =
  '이 사진을 거의 그대로 두되, 눈에 띄는 작은 차이를 5군데 정도만 만들어 주세요. ' +
  '예: 물건 하나 없애기, 색 하나 바꾸기, 작은 물건 하나 더 그리기, 무늬 바꾸기. ' +
  '전체 구도·인물·배경·밝기·화질은 원본과 똑같이 유지하고, 글자는 넣지 마세요. ' +
  '초등학생이 찾을 수 있을 만큼 분명한 차이여야 합니다.';

export async function POST(req: NextRequest) {
  const user = await verifyRequestUser(req);
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
  if (!isStaffRole(user.role)) {
    return NextResponse.json({ error: '선생님만 만들 수 있습니다' }, { status: 403 });
  }

  const key = process.env.OPENAI_API_KEY;
  if (!key) return NextResponse.json({ error: '이미지 생성 키가 없습니다' }, { status: 500 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });
  }

  const file = form.get('image');
  if (!(file instanceof Blob) || file.size === 0) {
    return NextResponse.json({ error: '사진이 없습니다' }, { status: 400 });
  }
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: '사진은 10MB 이하로 올려주세요' }, { status: 413 });
  }

  try {
    // 먼저 정리 — 폰 사진은 눕거나 너무 커서 그대로 넣으면 결과가 나쁘다
    const { default: sharp } = await import('sharp');
    const input = Buffer.from(await file.arrayBuffer());
    const cleaned = await sharp(input)
      .rotate()
      .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
      .normalize({ lower: 1, upper: 99 })
      .png()
      .toBuffer();

    const meta = await sharp(cleaned).metadata();
    // 세로로 긴 사진은 위아래로 놓으면 화면이 좁아진다 — 가로로 나란히 둔다
    const layout = (meta.height ?? 1) > (meta.width ?? 1) ? 'horizontal' : 'vertical';

    const fd = new FormData();
    fd.append('model', process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2');
    fd.append('prompt', PROMPT);
    fd.append('quality', 'low');
    fd.append('n', '1');
    fd.append('image', new Blob([new Uint8Array(cleaned)], { type: 'image/png' }), 'source.png');

    const res = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: fd,
    });
    const json = await res.json();
    if (!res.ok) {
      return NextResponse.json(
        { error: `변형 생성 실패: ${JSON.stringify(json).slice(0, 160)}` },
        { status: 502 }
      );
    }

    const item = json.data?.[0];
    let variantDataUrl = '';
    if (item?.b64_json) {
      variantDataUrl = `data:image/png;base64,${item.b64_json}`;
    } else if (item?.url) {
      const img = await fetch(item.url);
      const buf = Buffer.from(await img.arrayBuffer());
      variantDataUrl = `data:image/png;base64,${buf.toString('base64')}`;
    }
    if (!variantDataUrl) {
      return NextResponse.json({ error: '변형 사진을 받지 못했어요' }, { status: 502 });
    }

    return NextResponse.json({
      // 원본도 정리된 판으로 돌려준다 — 두 그림의 크기·방향이 같아야 좌표가 맞는다
      originalDataUrl: `data:image/png;base64,${cleaned.toString('base64')}`,
      variantDataUrl,
      layout,
      width: meta.width ?? 1024,
      height: meta.height ?? 1024,
    });
  } catch (e) {
    return NextResponse.json(
      { error: `만들지 못했어요: ${(e as Error).message.slice(0, 120)}` },
      { status: 500 }
    );
  }
}
