// 데모 작품 이미지를 생성해 Firebase Storage에 올리고 Firestore의 imageUrl을 채운다.
// 생성 이미지는 저장소(Storage)에만 두고 배포물에 포함하지 않는다.
import { readFileSync } from 'fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

const env = {};
for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}

initializeApp({
  credential: cert({
    projectId: env.FIREBASE_ADMIN_PROJECT_ID,
    clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/^"|"$/g, '').replace(/\\n/g, '\n'),
  }),
  storageBucket: env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
});
const db = getFirestore();
const bucket = getStorage().bucket();

const MODEL = env.OPENAI_IMAGE_MODEL || 'gpt-image-2';
const STYLE =
  '초등학생이 직접 그린 것 같은 그림. 크레용과 수채물감 느낌, 서툴지만 정성스러운 선, ' +
  '밝고 순수한 색감, 흰 도화지 위에 그린 그림, 사진이 아니라 아이의 그림. 글자 없음.';

const ACT = 'schools/aewol-elementary/classes/3-1/activities/watercolor/artworks';

async function generate(title) {
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      prompt: `${STYLE} 주제: ${title}`,
      size: '1024x1024',
      quality: 'low',
      n: 1,
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(json).slice(0, 300));
  const item = json.data?.[0];
  if (item?.b64_json) return Buffer.from(item.b64_json, 'base64');
  if (item?.url) return Buffer.from(await (await fetch(item.url)).arrayBuffer());
  throw new Error('이미지 응답 형식을 알 수 없음');
}

const snap = await db.collection(ACT).get();
const targets = snap.docs.filter((d) => !d.data().imageUrl);
console.log(`이미지 없는 작품 ${targets.length}점 / 전체 ${snap.size}점`);

for (const d of targets) {
  const { title } = d.data();
  try {
    process.stdout.write(`- ${title} ... `);
    const buf = await generate(title);
    const path = `app-assets/demo-artworks/${d.id}.png`;
    const file = bucket.file(path);
    await file.save(buf, { contentType: 'image/png', resumable: false });
    await file.makePublic();
    const url = `https://storage.googleapis.com/${bucket.name}/${path}`;
    await d.ref.update({ imageUrl: url, thumbnailUrl: url });
    console.log(`완료 (${Math.round(buf.length / 1024)}KB)`);
  } catch (e) {
    console.log(`실패: ${e.message.slice(0, 160)}`);
  }
}
process.exit(0);
