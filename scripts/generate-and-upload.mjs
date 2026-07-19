import fs from 'fs';
import path from 'path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const BUCKET_NAME = 'aewol-62635.firebasestorage.app';
const LOCAL_TEMP = 'C:/Users/na/AppData/Local/Temp/claude/C--Users-na-Desktop-newproject-00-aewol/bf494b00-5837-4aba-b217-c2e54d44a996/scratchpad/temp_images';

// Firebase Admin 초기화
const serviceAccount = {
  type: 'service_account',
  project_id: 'aewol-62635',
  private_key_id: 'd9a5e66ff34c4b49b096ff8093064285dc5404ef',
  private_key: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  client_email: 'firebase-adminsdk-fbsvc@aewol-62635.iam.gserviceaccount.com',
  client_id: '112036828869909501469',
  auth_uri: 'https://accounts.google.com/o/oauth2/auth',
  token_uri: 'https://oauth2.googleapis.com/token',
};

initializeApp({ credential: cert(serviceAccount), storageBucket: BUCKET_NAME });
const bucket = getStorage().bucket();

if (!fs.existsSync(LOCAL_TEMP)) fs.mkdirSync(LOCAL_TEMP, { recursive: true });

async function generateImage(prompt, filename, size = '1024x1536') {
  console.log(`Generating: ${filename}...`);
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-image-1', prompt, n: 1, size, quality: 'low' }),
  });
  if (!res.ok) { console.error(`Error:`, await res.text()); return null; }
  const data = await res.json();
  const b64 = data.data[0].b64_json;
  const localPath = path.join(LOCAL_TEMP, filename);
  if (b64) {
    fs.writeFileSync(localPath, Buffer.from(b64, 'base64'));
  } else if (data.data[0].url) {
    const imgRes = await fetch(data.data[0].url);
    fs.writeFileSync(localPath, Buffer.from(await imgRes.arrayBuffer()));
  }
  console.log(`Generated: ${filename}`);
  return localPath;
}

async function uploadToStorage(localPath, storagePath) {
  console.log(`Uploading: ${storagePath}...`);
  await bucket.upload(localPath, {
    destination: storagePath,
    metadata: { contentType: 'image/png', cacheControl: 'public, max-age=31536000' },
  });
  const file = bucket.file(storagePath);
  await file.makePublic();
  const url = `https://storage.googleapis.com/${BUCKET_NAME}/${storagePath}`;
  console.log(`Uploaded: ${url}`);
  return url;
}

const urls = {};

// 1. 메인 화면 — 운동장 행사 일러스트
const mainPrompt = `A bright, cheerful cartoon illustration in bird's-eye/aerial view of a Korean elementary school field event day. The scene shows:
- A large green grass field viewed from directly above (drone perspective)
- Two long lines of cute cartoon students holding large colorful banners/cloths
- Top line of students in white shirts holding a yellow and red banner
- Bottom line of students in colorful clothes holding a yellow and blue banner
- Small national flags scattered on the grass between the two groups
- Bright sunny day, vivid green grass
- The overall style is warm, cheerful, casual mobile game illustration (like a cozy town-building game)
- Pastel-bright colors, NOT photorealistic
- Kid-friendly cartoon style, fun and inviting
- No text anywhere in the image
- The composition should feel like a school festival celebration from above`;

const mainPath = await generateImage(mainPrompt, 'school-event-main.png');
if (mainPath) urls.schoolEventMain = await uploadToStorage(mainPath, 'app-assets/school-event-main.png');

// 2. 기존 학교 건물 전경도 Storage로 이전
const facadePath = 'C:/Users/na/Desktop/newproject/00_aewol/app/public/images/school-facade.png';
if (fs.existsSync(facadePath)) {
  urls.schoolFacade = await uploadToStorage(facadePath, 'app-assets/school-facade.png');
}

// 3. 교실 내부도 Storage로 이전
const classroomPath = 'C:/Users/na/Desktop/newproject/00_aewol/app/public/images/classroom-interior.png';
if (fs.existsSync(classroomPath)) {
  urls.classroomInterior = await uploadToStorage(classroomPath, 'app-assets/classroom-interior.png');
}

console.log('\n=== All URLs ===');
console.log(JSON.stringify(urls, null, 2));

// URL 파일로 저장
fs.writeFileSync(
  path.join(LOCAL_TEMP, 'image-urls.json'),
  JSON.stringify(urls, null, 2)
);
console.log('\nDone! URLs saved to image-urls.json');
