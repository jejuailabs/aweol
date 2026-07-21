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
const BASE_URL_=process.env.BASE_URL||'http://localhost:3000';
const KID='zz-meal-kid';
await adb.collection('users').doc(KID).set({displayName:'급식아이',role:'student',
  pendingRole:null,pendingSchoolId:null,pendingClassId:null,schoolIds:[],classIds:[],
  children:[],stamps:0,avatarCustom:{hat:null,accessory:null},avatarId:null,preferences:{theme:'light'}});

// 캐시를 비워 진짜로 NEIS 를 부르는지 본다
await adb.doc(`schools/${SCHOOL}`).update({meal:null}).catch(()=>{});

await signInWithCustomToken(cauth, await getAdminAuth().createCustomToken(KID));
const token=await cauth.currentUser.getIdToken();
const call=(tok)=>fetch(`${BASE_URL_}/api/meal?schoolId=${SCHOOL}`,
  {headers: tok?{Authorization:`Bearer ${tok}`}:{}});

console.log('MARK1');
let r=await call(null);
ok('비로그인 거부', r.status===401, `HTTP ${r.status}`);

r=await call(token);
let j=await r.json();
ok('급식을 받아옴', r.ok, `HTTP ${r.status}`);
console.log('  메뉴:', (j.dishes||[]).join(' / '));
console.log('  열량:', j.kcal, '· 캐시?', j.cached);
ok('처음엔 새로 받아옴', j.cached===false, String(j.cached));

console.log('MARK2');
r=await call(token);
j=await r.json();
ok('두 번째는 캐시에서 (NEIS 안 부름)', j.cached===true, String(j.cached));

const saved=(await adb.doc(`schools/${SCHOOL}`).get()).data();
ok('학교 문서에 NEIS 코드가 저장됨', !!saved?.neis?.school, JSON.stringify(saved?.neis));
ok('급식이 학교 문서에 저장됨', !!saved?.meal?.date, String(saved?.meal?.date));
ok('알레르기 번호가 지워짐',
  (saved?.meal?.dishes||[]).every(d=>!/[()]/.test(d)),
  (saved?.meal?.dishes||[]).slice(0,2).join(' / '));

await signOut(cauth).catch(()=>{});
const logs=await adb.collection('accessLogs').where('uid','==',KID).get();
for(const l of logs.docs) await l.ref.delete();
await adb.collection('users').doc(KID).delete();
console.log(`\n실패 ${failed}건`);
process.exit(failed>0?1:0);
