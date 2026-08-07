/**
 * NPC 빌보드 이미지를 Storage 에 올린다.
 *
 * gpt-image-2 로 뽑아 마젠타 누끼를 딴 캐릭터들(스크래치패드)을
 * webp(512px, 투명 유지)로 줄여 `app-assets/` 에 올린다.
 * 전 학교 공용 에셋이라 여기다 — 규칙은 STATE.md 5번.
 *
 *   FIREBASE_ADMIN_PRIVATE_KEY 는 .env.local 에서 읽는다.
 *   node scripts/upload-npc-billboards.mjs <이미지 폴더>
 */
import fs from 'node:fs';
import path from 'node:path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import sharp from 'sharp';

const SRC = process.argv[2];
if (!SRC || !fs.existsSync(SRC)) {
  console.error('사용법: node scripts/upload-npc-billboards.mjs <cut.png 들이 있는 폴더>');
  process.exit(1);
}

// .env.local 에서 키를 읽는다 (dotenv 없이)
const env = fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const PRIVATE_KEY = env.match(/^FIREBASE_ADMIN_PRIVATE_KEY="?([\s\S]*?)"?$/m)?.[1]?.replace(/\\n/g, '\n');
if (!PRIVATE_KEY) { console.error('FIREBASE_ADMIN_PRIVATE_KEY 없음'); process.exit(1); }

const BUCKET_NAME = 'aewol-62635.firebasestorage.app';
initializeApp({
  credential: cert({
    projectId: 'aewol-62635',
    clientEmail: 'firebase-adminsdk-fbsvc@aewol-62635.iam.gserviceaccount.com',
    privateKey: PRIVATE_KEY,
  }),
  storageBucket: BUCKET_NAME,
});
const bucket = getStorage().bucket();

const FILES = [
  'npc-officer', 'npc-postman', 'npc-librarian', 'mob-dolhareubang',
  'player-boy', 'player-girl',
];

for (const name of FILES) {
  const src = path.join(SRC, `${name}.cut.png`);
  if (!fs.existsSync(src)) { console.log(name, '없음 — 건너뜀'); continue; }
  // 512px 로 줄이고 webp — 투명이 살아 있고 원본(600~900KB)이 수십 KB 가 된다
  const buf = await sharp(src).resize({ height: 512 }).webp({ quality: 82 }).toBuffer();
  const dest = `app-assets/${name}.webp`;
  await bucket.file(dest).save(buf, {
    metadata: { contentType: 'image/webp', cacheControl: 'public, max-age=31536000' },
  });
  await bucket.file(dest).makePublic();
  console.log(`${name}: ${(fs.statSync(src).size / 1024) | 0}KB → ${(buf.length / 1024) | 0}KB → ${dest}`);
}
console.log('완료');
