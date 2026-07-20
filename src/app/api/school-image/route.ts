import { NextRequest, NextResponse } from 'next/server';
import { verifyRequestUser } from '@/lib/firebase-admin';

export const runtime = 'nodejs';
export const maxDuration = 60;

const ASSET_WORDS: Record<string, string> = {
  rainbow: '하늘에 무지개',
  playground: '앞에 운동장과 트랙',
  flowers: '화단에 알록달록한 꽃',
  trees: '주변에 둥근 나무들',
};

/** 학교 대표 이미지 생성 — 슈퍼 관리자만 */
export async function POST(req: NextRequest) {
  const user = await verifyRequestUser(req);
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
  if (user.role !== 'super_admin') {
    return NextResponse.json({ error: '총관리자만 사용할 수 있습니다' }, { status: 403 });
  }

  const key = process.env.OPENAI_API_KEY;
  if (!key) return NextResponse.json({ error: '이미지 생성 키가 설정되지 않았습니다' }, { status: 500 });

  let body: { name?: string; assets?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });
  }

  const name = (body.name || '').trim().slice(0, 40);
  if (!name) return NextResponse.json({ error: '학교 이름이 필요합니다' }, { status: 400 });

  const extras = (body.assets || [])
    .map((a) => ASSET_WORDS[a])
    .filter(Boolean)
    .join(', ');

  const prompt =
    '동물의 숲 같은 아기자기한 3D 로우폴리 게임 스타일의 초등학교 건물 일러스트. ' +
    '둥근 모서리, 파스텔과 선명한 원색, 장난감 같은 느낌, 밝은 대낮, 정면에서 살짝 위에서 본 구도. ' +
    (extras ? `${extras}. ` : '') +
    '글자나 간판 텍스트는 넣지 말 것.';

  try {
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2',
        prompt,
        size: '1024x1024',
        quality: 'low',
        n: 1,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      return NextResponse.json(
        { error: `생성 실패: ${JSON.stringify(json).slice(0, 160)}` },
        { status: 502 }
      );
    }
    const item = json.data?.[0];
    if (item?.b64_json) {
      return NextResponse.json({ dataUrl: `data:image/png;base64,${item.b64_json}` });
    }
    if (item?.url) {
      const img = await fetch(item.url);
      const buf = Buffer.from(await img.arrayBuffer());
      return NextResponse.json({ dataUrl: `data:image/png;base64,${buf.toString('base64')}` });
    }
    return NextResponse.json({ error: '이미지 응답 형식을 알 수 없습니다' }, { status: 502 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message.slice(0, 160) }, { status: 500 });
  }
}
