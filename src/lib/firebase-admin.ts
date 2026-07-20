// 주의 1: 'server-only'를 여기서 import 하면 안 된다.
//   Route Handler는 react-server 조건으로 번들되지 않아 그 패키지가 로드 시점에 예외를 던진다.
// 주의 2: 'firebase-admin/auth'를 import 하면 안 된다.
//   firebase-admin@14 → jwks-rsa@4 → jose@6(ESM 전용) 체인이 서버리스에서
//   require() of ES Module 로 터져 이 파일을 쓰는 API가 전부 500이 된다.
//   토큰 검증은 아래에서 jose로 직접 한다. (firestore 쪽은 이 체인을 타지 않아 안전)
import { getApps, initializeApp, cert, App } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createRemoteJWKSet, jwtVerify } from 'jose';

let app: App | null = null;

function getAdminApp(): App {
  if (app) return app;
  const existing = getApps();
  if (existing.length > 0) {
    app = existing[0];
    return app;
  }
  const privateKey = (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '')
    .replace(/^"|"$/g, '')
    .replace(/\\n/g, '\n');
  app = initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey,
    }),
  });
  return app;
}

export const adminDb = () => getFirestore(getAdminApp());

/**
 * Firebase ID 토큰 검증용 공개키.
 * 구글이 키를 주기적으로 교체하므로 jose가 캐시·갱신을 알아서 처리한다.
 */
const JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')
);

/** Firebase ID 토큰을 직접 검증해 uid를 돌려준다 (firebase-admin/auth 대체) */
async function verifyIdToken(token: string) {
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID || '';
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: `https://securetoken.google.com/${projectId}`,
    audience: projectId,
    algorithms: ['RS256'],
  });
  // Firebase는 sub 에 uid 를 담는다. 비어 있으면 신뢰할 수 없다.
  const uid = typeof payload.sub === 'string' ? payload.sub : '';
  if (!uid) throw new Error('토큰에 uid가 없습니다');
  return { uid, name: typeof payload.name === 'string' ? payload.name : '' };
}

/**
 * 요청 헤더에서 클라이언트 IP를 뽑는다.
 * Vercel은 x-forwarded-for 맨 앞이 실제 클라이언트 IP다.
 */
export function getClientIp(headers: Headers): string {
  const fwd = headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return headers.get('x-real-ip') || 'unknown';
}

/** Authorization: Bearer <idToken> 을 검증하고 사용자 정보를 돌려준다. */
export async function verifyRequestUser(req: Request) {
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) return null;
  try {
    const decoded = await verifyIdToken(token);
    const snap = await adminDb().collection('users').doc(decoded.uid).get();
    const data = snap.data() || {};
    return {
      uid: decoded.uid,
      displayName: (data.displayName as string) || decoded.name || '이름 없음',
      role: (data.role as string) || null,
      classIds: (data.classIds as string[]) || [],
    };
  } catch {
    return null;
  }
}
