import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

/**
 * 배포 환경 진단용. 비밀값은 노출하지 않고 존재 여부와 길이만 알려준다.
 * 문제 해결 후 삭제할 임시 경로.
 */
export async function GET() {
  const envKeys = [
    'FIREBASE_ADMIN_PROJECT_ID',
    'FIREBASE_ADMIN_CLIENT_EMAIL',
    'FIREBASE_ADMIN_PRIVATE_KEY',
    'OPENAI_API_KEY',
    'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
    'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
  ];
  const env: Record<string, string> = {};
  for (const k of envKeys) {
    const v = process.env[k];
    env[k] = v ? `설정됨 (${v.length}자)` : '없음';
  }

  const modules: Record<string, string> = {};
  try {
    await import('firebase-admin/app');
    modules['firebase-admin'] = 'ok';
  } catch (e) {
    modules['firebase-admin'] = `실패: ${(e as Error).message.slice(0, 120)}`;
  }
  try {
    const sharp = (await import('sharp')).default;
    modules['sharp'] = `ok (${sharp.versions?.vips || 'version unknown'})`;
  } catch (e) {
    modules['sharp'] = `실패: ${(e as Error).message.slice(0, 200)}`;
  }

  // 500을 내는 세 경로가 공통으로 쓰는 래퍼를 직접 불러본다
  try {
    const mod = await import('@/lib/firebase-admin');
    modules['@/lib/firebase-admin'] = 'import ok';
    try {
      mod.adminDb();
      modules['adminDb()'] = 'ok';
    } catch (e) {
      modules['adminDb()'] = `실패: ${(e as Error).message.slice(0, 300)}`;
    }
    try {
      // 가짜 토큰이므로 반드시 null 이 나와야 정상 (예외 없이 통과하는지가 핵심)
      const r = await mod.verifyRequestUser(
        new Request('https://x/', { headers: { authorization: 'Bearer not.a.real.token' } })
      );
      modules['verifyRequestUser()'] = r === null ? 'ok (가짜 토큰 거부)' : '이상: 통과됨';
    } catch (e) {
      modules['verifyRequestUser()'] = `실패: ${(e as Error).message.slice(0, 300)}`;
    }
  } catch (e) {
    modules['@/lib/firebase-admin'] = `import 실패: ${(e as Error).message.slice(0, 300)}`;
  }

  return NextResponse.json({ env, modules });
}
