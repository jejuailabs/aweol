// 단일 학교 시절 만들어진 school 문서에 지도용 필드를 채운다.
import { readFileSync } from 'fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

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
});
const db = getFirestore();

const ref = db.collection('schools').doc('aewol-elementary');
const snap = await ref.get();

const patch = {
  name: snap.data()?.name || '애월초등학교',
  // 제주 애월읍 실제 좌표
  lat: 33.4626,
  lng: 126.3316,
  tagline: snap.data()?.tagline || '제주 바다가 보이는 학교',
  imageUrl: snap.data()?.imageUrl || '',
  gradeCount: snap.data()?.gradeCount || 6,
  classPerGrade: snap.data()?.classPerGrade || 4,
  assets: snap.data()?.assets || ['rainbow', 'trees', 'flowers', 'playground'],
  isArchived: false,
};
if (!snap.exists) patch.createdAt = FieldValue.serverTimestamp();

await ref.set(patch, { merge: true });
console.log(`✓ ${patch.name} 지도 좌표 설정 (${patch.lat}, ${patch.lng})`);

const after = await ref.get();
const d = after.data();
console.log(`  name=${d.name} lat=${d.lat} lng=${d.lng} isArchived=${d.isArchived}`);

const classes = await ref.collection('classes').get();
console.log(`  반 ${classes.size}개`);
process.exit(0);
