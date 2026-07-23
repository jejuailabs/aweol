import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

/**
 * **일회용 확인 코드.** `firebase-admin/auth` 가 정말 못 쓰는 물건인지 재본다.
 *
 * STATE.md 규칙 1번이 "import 하면 서버리스에서 통째로 500" 이라고 적어뒀는데,
 * 그 관찰이 지금도 맞는지 확인하려는 것이다. 확인이 끝나면 이 파일은 지운다.
 */
export async function GET() {
  const out: Record<string, unknown> = { node: process.version };
  try {
    const mod = await import('firebase-admin/auth');
    out.importedAuth = true;
    out.hasCreateCustomToken = typeof mod.getAuth === 'function';
  } catch (e) {
    out.importedAuth = false;
    out.importError = String((e as Error)?.message ?? e).slice(0, 300);
  }
  return NextResponse.json(out);
}
