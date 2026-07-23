// 주의 1: 'server-only'를 여기서 import 하면 안 된다.
//   Route Handler는 react-server 조건으로 번들되지 않아 그 패키지가 로드 시점에 예외를 던진다.
// 주의 2: 'firebase-admin/auth'를 import 하면 안 된다.
//   firebase-admin@14 → jwks-rsa@4 → jose@6(ESM 전용) 체인이 서버리스에서
//   require() of ES Module 로 터져 이 파일을 쓰는 API가 전부 500이 된다.
//   토큰 검증은 아래에서 jose로 직접 한다. (firestore 쪽은 이 체인을 타지 않아 안전)
import { getApps, initializeApp, cert, App } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createRemoteJWKSet, importPKCS8, jwtVerify, SignJWT } from 'jose';

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
 * 아이용 커스텀 토큰을 만든다 (이름 + 반 비밀번호 로그인).
 *
 * **`firebase-admin/auth` 의 `createCustomToken` 을 쓰면 안 된다** — 이 파일 맨 위
 * 주의 2번과 같은 이유다. 2026-07-23 에 배포본에서 직접 재확인했다(Node v24.18.0):
 * `jwks-rsa`(CJS)가 `jose@6`(ESM)를 require 해서 `ERR_REQUIRE_ESM` 이 난다.
 * **로컬에서는 통과한다** — 로컬은 번들에 넣고 Vercel 은 외부 모듈로 두기 때문이라
 * Node 를 올려도 해결되지 않는다.
 *
 * 커스텀 토큰은 결국 **서비스 계정 키로 서명한 JWT** 하나다. 이 파일이 이미
 * jose 로 토큰을 *검증*하고 있으니, 서명도 같은 방식으로 직접 한다.
 *
 * 아이에게 이메일 주소를 만들어 주지 않으려고 이 길을 택했다. 초등학생에게
 * 이메일은 아무 의미가 없고, 만드는 순간 관리할 것만 늘어난다.
 */
export async function createStudentToken(uid: string): Promise<string> {
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL || '';
  const pk = (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '')
    .replace(/^"|"$/g, '')
    .replace(/\\n/g, '\n');
  if (!clientEmail || !pk) throw new Error('서비스 계정 설정이 없습니다');

  const key = await importPKCS8(pk, 'RS256');
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    uid,
    // 이 계정이 어디서 왔는지 남긴다 (구글 로그인과 구분)
    claims: { via: 'roster' },
  })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer(clientEmail)
    .setSubject(clientEmail)
    .setAudience('https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit')
    .setIssuedAt(now)
    /**
     * 커스텀 토큰의 상한은 1시간이고, 이건 **교환권**이라 짧아도 된다.
     * 한 번 교환하면 그 뒤로는 Firebase 가 알아서 세션을 이어간다 —
     * 그래서 한 번 로그인한 기기는 계속 로그인 상태로 남는다.
     */
    .setExpirationTime(now + 3600)
    .sign(key);
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
      /** 교사가 소속된 학교. 교사 권한은 이 목록 안에서만 통한다. */
      schoolIds: (data.schoolIds as string[]) || [],
    };
  } catch {
    return null;
  }
}

export type RequestUser = NonNullable<Awaited<ReturnType<typeof verifyRequestUser>>>;

/**
 * 이 학교의 교직원인가.
 *
 * 예전에는 role === 'teacher' 하나로 판정해서, 승인만 받으면 **모든 학교**의 명부와
 * 제출물을 볼 수 있었다. 교사 권한은 반드시 소속 학교 안에서만 통해야 한다.
 * 슈퍼관리자만 전체를 넘나든다.
 */
export function isStaffOfSchool(
  user: { role: string | null; schoolIds: string[] },
  schoolId: string
): boolean {
  if (user.role === 'super_admin') return true;
  return (user.role === 'teacher' || user.role === 'school_admin')
    && user.schoolIds.includes(schoolId);
}

/**
 * 이 학교의 **관리자**인가 (학교관리자 또는 총관리자).
 *
 * 교직원 판정(`isStaffOfSchool`)보다 좁다. 반 만들기·교사 승인처럼
 * **학교 전체에 영향을 주는 일**은 담임 한 명이 정할 것이 아니다.
 */
export function isSchoolAdminOfSchool(
  user: { role: string | null; schoolIds: string[] },
  schoolId: string
): boolean {
  if (user.role === 'super_admin') return true;
  return user.role === 'school_admin' && user.schoolIds.includes(schoolId);
}

/**
 * 이 **반**의 담당 교사인가.
 *
 * 학교 소속만으로는 부족하다. 한 학교에 교사가 여럿인데 아무나 남의 반 명부를 보고
 * 숙제를 고칠 수 있으면 안 된다. 담당 반 안에서만 권한이 통해야 한다.
 * 슈퍼관리자만 전체를 넘나든다.
 */
export function isTeacherOfClass(
  user: { role: string | null; schoolIds: string[]; classIds: string[] },
  schoolId: string,
  classId: string
): boolean {
  if (user.role === 'super_admin') return true;
  // 학교관리자도 맡은 반 안에서만 담임과 같다 (겸직하는 경우)
  return (
    (user.role === 'teacher' || user.role === 'school_admin') &&
    user.schoolIds.includes(schoolId) &&
    user.classIds.includes(classId)
  );
}

/** 학교를 특정하지 않는 자리에서만 쓴다 (예: 도장 도안 구입) */
export function isStaffRole(role: string | null): boolean {
  return role === 'teacher' || role === 'school_admin' || role === 'super_admin';
}
