// 학교 조사·교표 검증.
// 이 기능은 '틀린 정보를 안 넣는 것'이 핵심이라, 권한만이 아니라
// **못 찾았을 때 빈 칸으로 돌아오는지**까지 본다.
import { readFileSync } from 'fs';
import { initializeApp as initAdmin, cert } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore as getAdminDb } from 'firebase-admin/firestore';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signOut } from 'firebase/auth';
import { getFirestore, collection, doc, getDoc, getDocs, addDoc, setDoc, deleteDoc, updateDoc, query, where, serverTimestamp } from 'firebase/firestore';

const BASE = process.env.BASE_URL || 'http://localhost:3000';

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
const adb = getAdminDb();
const clientApp = initializeApp({
  apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: env.NEXT_PUBLIC_FIREBASE_APP_ID,
});
const cauth = getAuth(clientApp);


const cdb = getFirestore(clientApp);
let failed = 0;
const ok = (n, c, extra = '') => {
  console.log(`${c ? '✓' : '✗'} ${n}${extra ? ' — ' + extra : ''}`);
  if (!c) failed++;
};


const SCHOOL='aewol-elementary';
const CLS='3-1';
const HW='zz-verify-hw';
const SA='zz-verify-superadmin';
const OUT='zz-verify-outsider';

// 검증용 숙제 하나
await adb.doc(`schools/${SCHOOL}/classes/${CLS}/homeworks/${HW}`).set({
  title:'[검증] 제출 테스트', description:'', submitType:'text',
  visibility:'class', dueDate:null, authorUid:'zz', authorName:'t', createdAt:new Date(),
});

// 슈퍼어드민 / 이 학교와 무관한 사람
await adb.collection('users').doc(SA).set({displayName:'검증총관리자',role:'super_admin',
  pendingRole:null,pendingSchoolId:null,pendingClassId:null,
  schoolIds:[],classIds:[],children:[],stamps:0,
  avatarCustom:{hat:null,accessory:null},avatarId:null,preferences:{theme:'light'}});
await adb.collection('users').doc(OUT).set({displayName:'검증외부인',role:'student',
  pendingRole:null,pendingSchoolId:null,pendingClassId:null,
  schoolIds:[SCHOOL],classIds:['9-9'],children:[],stamps:0,
  avatarCustom:{hat:null,accessory:null},avatarId:null,preferences:{theme:'light'}});

const submitAs = async (uid, text) => {
  await signOut(cauth).catch(()=>{});
  await signInWithCustomToken(cauth, await getAdminAuth().createCustomToken(uid));
  const idToken = await cauth.currentUser.getIdToken();
  const res = await fetch(`${BASE}/api/homework`, {
    method:'POST',
    headers:{'Content-Type':'application/json', Authorization:`Bearer ${idToken}`},
    body: JSON.stringify({schoolId:SCHOOL, classId:CLS, homeworkId:HW, text}),
  });
  return res.status;
};

const s1 = await submitAs(SA, '총관리자가 낸 제출물');
ok(`총관리자는 숙제를 제출할 수 있다 (${s1})`, s1 === 200);

const saved = await adb.doc(`schools/${SCHOOL}/classes/${CLS}/homeworks/${HW}/submissions/${SA}`).get();
ok('제출물이 실제로 저장됐다', saved.exists);
ok('낸 내용이 그대로다', saved.exists && saved.data().text === '총관리자가 낸 제출물');

const s2 = await submitAs(OUT, '남의 반 아이가 낸 것');
ok(`이 반 아이가 아니면 막힌다 (${s2})`, s2 === 403);

await signOut(cauth).catch(()=>{});
// 정리
const subs = await adb.collection(`schools/${SCHOOL}/classes/${CLS}/homeworks/${HW}/submissions`).get();
for (const d of subs.docs) await d.ref.delete();
await adb.doc(`schools/${SCHOOL}/classes/${CLS}/homeworks/${HW}`).delete();
for (const u of [SA, OUT]) {
  const logs = await adb.collection('accessLogs').where('uid','==',u).get();
  for (const l of logs.docs) await l.ref.delete();
  await adb.collection('users').doc(u).delete();
}
console.log(`\n실패 ${failed}건`);
process.exit(failed>0?1:0);
