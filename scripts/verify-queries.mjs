// 실제 배포된 보안 규칙에 대해, 앱이 실제로 던지는 쿼리가 통과하는지 검증한다.
// Admin SDK로 커스텀 토큰을 만든 뒤 클라이언트 SDK로 로그인해서 확인하므로 규칙이 그대로 적용된다.
import { readFileSync } from 'fs';
import { initializeApp as initAdmin, cert } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore as getAdminDb } from 'firebase-admin/firestore';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signOut } from 'firebase/auth';
import { getFirestore, collection, getDocs, query, where, collectionGroup, doc, setDoc, deleteDoc } from 'firebase/firestore';

const env = {};
for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}

initAdmin({
  credential: cert({
    projectId: env.FIREBASE_ADMIN_PROJECT_ID,
    clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/^"|"$/g, '').replace(/\\n/g, '\n'),
  }),
});

// 실제 슈퍼 관리자 uid 찾기
const usersSnap = await getAdminDb().collection('users').get();
const superDoc = usersSnap.docs.find((d) => d.data().role === 'super_admin');
if (!superDoc) {
  console.error('super_admin 계정을 찾지 못했습니다.');
  process.exit(1);
}
const superUid = superDoc.id;

const clientApp = initializeApp({
  apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  appId: env.NEXT_PUBLIC_FIREBASE_APP_ID,
});
const clientAuth = getAuth(clientApp);
const cdb = getFirestore(clientApp);

let failed = 0;
async function check(name, fn, expect = 'allow') {
  try {
    const n = await fn();
    if (expect === 'allow') console.log(`✓ ${name}${n !== undefined ? ` (${n}건)` : ''}`);
    else { console.log(`✗ ${name} — 차단돼야 하는데 통과함`); failed++; }
  } catch (e) {
    if (expect === 'deny') console.log(`✓ ${name} — 예상대로 차단됨`);
    else { console.log(`✗ ${name} — ${e.code || e.message}`); failed++; }
  }
}

// ---------- 1) 비로그인 방문자 ----------
console.log('[비로그인 관람객]');
await check('학급 목록 조회', async () => {
  const s = await getDocs(query(collection(cdb, 'schools/aewol-elementary/classes'), where('isArchived', '==', false)));
  return s.size;
});
await check('전시실 작품 조회 (승인본만)', async () => {
  const s = await getDocs(
    query(collection(cdb, 'schools/aewol-elementary/classes/3-1/activities/watercolor/artworks'), where('status', '==', 'approved'))
  );
  return s.size;
});
await check('전체 갤러리 collectionGroup 조회', async () => {
  const s = await getDocs(query(collectionGroup(cdb, 'artworks'), where('status', '==', 'approved')));
  return s.size;
});
await check('users 목록 조회', async () => {
  const s = await getDocs(collection(cdb, 'users'));
  return s.size;
}, 'deny');
await check('학생 명부 조회 (개인정보 — 차단돼야 함)', async () => {
  const s = await getDocs(collection(cdb, 'schools/aewol-elementary/classes/3-1/students'));
  return s.size;
}, 'deny');

// ---------- 2) 슈퍼 관리자 ----------
console.log('\n[슈퍼 관리자 — 대시보드 쿼리]');
const customToken = await getAdminAuth().createCustomToken(superUid);
await signInWithCustomToken(clientAuth, customToken);

await check('users 목록 조회 (구성원 현황)', async () => {
  const s = await getDocs(collection(cdb, 'users'));
  return s.size;
});
await check('학생 명부 조회', async () => {
  const s = await getDocs(collection(cdb, 'schools/aewol-elementary/classes/3-1/students'));
  return s.size;
});
await check('미승인 포함 전체 작품 조회 (승인 대기 집계)', async () => {
  const s = await getDocs(collection(cdb, 'schools/aewol-elementary/classes/3-1/activities/watercolor/artworks'));
  return s.size;
});
await check('학생 명부 등록/삭제 (수동 등록·엑셀 업로드)', async () => {
  const ref = doc(cdb, 'schools/aewol-elementary/classes/3-1/students/zz-verify-tmp');
  await setDoc(ref, { number: 999, name: '검증용' });
  await deleteDoc(ref);
});
await check('명부 업로드 기록 저장', async () => {
  const ref = doc(cdb, 'schools/aewol-elementary/rosterUploads/zz-verify-tmp');
  await setDoc(ref, { classId: '3-1', rowCount: 0 });
  await deleteDoc(ref);
});
await check('활동(전시실) 생성', async () => {
  const ref = doc(cdb, 'schools/aewol-elementary/classes/3-1/activities/zz-verify-tmp');
  await setDoc(ref, { title: '검증용', order: 99 });
  await deleteDoc(ref);
});

await signOut(clientAuth);
console.log(`\n실패 ${failed}건`);
process.exit(failed > 0 ? 1 : 0);

