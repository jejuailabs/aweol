// 서비스 계정으로 Firestore/Storage 보안 규칙 + 인덱스 배포 (firebase CLI 로그인 불필요)
import { readFileSync } from 'fs';
import { GoogleAuth } from 'google-auth-library';

// ---- .env.local 파싱 ----
const env = {};
for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}
const projectId = env.FIREBASE_ADMIN_PROJECT_ID;
const clientEmail = env.FIREBASE_ADMIN_CLIENT_EMAIL;
const privateKey = env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/^"|"$/g, '').replace(/\\n/g, '\n');
const bucket = env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;

/**
 * 실시간 데이터베이스 보안 규칙 배포.
 *
 * Firestore 와 배포 방법도, **필요한 스코프도 다르다.**
 * cloud-platform 만으로는 401 이 난다 — firebase.database 와 userinfo.email 이 있어야 한다.
 * RTDB 는 REST 로 `.settings/rules.json` 에 PUT 한다.
 */
const auth = new GoogleAuth({
  credentials: { client_email: clientEmail, private_key: privateKey },
  scopes: [
    'https://www.googleapis.com/auth/firebase.database',
    'https://www.googleapis.com/auth/userinfo.email',
  ],
});
const client = await auth.getClient();
const { token } = await client.getAccessToken();

const dbUrl = env.NEXT_PUBLIC_FIREBASE_DATABASE_URL;
if (!dbUrl) {
  console.error('✗ NEXT_PUBLIC_FIREBASE_DATABASE_URL 이 .env.local 에 없습니다');
  process.exit(1);
}

const rules = readFileSync('database.rules.json', 'utf8');
const res = await fetch(`${dbUrl.replace(/\/$/, '')}/.settings/rules.json`, {
  method: 'PUT',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: rules,
});
const text = await res.text();
if (res.ok) {
  console.log('✓ database.rules.json → RTDB 배포 완료');
} else {
  console.error('✗ RTDB 규칙 배포 실패:', res.status, text.slice(0, 400));
  process.exit(1);
}
