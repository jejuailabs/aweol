// Storage 버킷 CORS 설정 (gsutil 없이 서비스 계정으로 직접)
//
// 3D 전시실은 작품 사진을 WebGL 텍스처로 올린다. 텍스처는 crossOrigin='anonymous' 로
// 받아야 해서 버킷이 Access-Control-Allow-Origin 을 돌려주지 않으면 그림이 통째로 안 뜬다.
// (콘솔에는 "has been blocked by CORS policy" 만 찍히고 액자가 빈 채로 남는다)
import { readFileSync } from 'fs';
import { GoogleAuth } from 'google-auth-library';

const env = {};
for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}
const clientEmail = env.FIREBASE_ADMIN_CLIENT_EMAIL;
const privateKey = env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/^"|"$/g, '').replace(/\\n/g, '\n');
const bucket = env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;

const ORIGINS = [
  'https://aweol.vercel.app',
  'http://localhost:3000',
  'http://localhost:3001',
];

const auth = new GoogleAuth({
  credentials: { client_email: clientEmail, private_key: privateKey },
  scopes: ['https://www.googleapis.com/auth/devstorage.full_control'],
});
const client = await auth.getClient();
const { token } = await client.getAccessToken();

const url = `https://storage.googleapis.com/storage/v1/b/${bucket}?fields=cors`;

const res = await fetch(url, {
  method: 'PATCH',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    cors: [
      {
        origin: ORIGINS,
        method: ['GET', 'HEAD'],
        responseHeader: ['Content-Type', 'Access-Control-Allow-Origin'],
        maxAgeSeconds: 3600,
      },
    ],
  }),
});

const text = await res.text();
if (!res.ok) {
  console.error(`✗ CORS 설정 실패 (HTTP ${res.status})`);
  console.error(text.slice(0, 600));
  process.exit(1);
}

console.log(`✓ ${bucket} CORS 설정 완료`);
console.log('  허용 origin:', ORIGINS.join(', '));
console.log('  ' + text.replace(/\s+/g, ' ').slice(0, 300));
