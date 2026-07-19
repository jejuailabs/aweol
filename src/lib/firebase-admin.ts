import 'server-only';
import { getApps, initializeApp, cert, App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

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

export const adminAuth = () => getAuth(getAdminApp());
export const adminDb = () => getFirestore(getAdminApp());

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
    const decoded = await adminAuth().verifyIdToken(token);
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
