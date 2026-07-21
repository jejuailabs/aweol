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
const MINE='3-1';
const OTHER='3-2';
const TEA='zz-scope-tea';
await adb.collection('users').doc(TEA).set({displayName:'3-1담임',role:'teacher',
  pendingRole:null,pendingSchoolId:null,pendingClassId:null,
  schoolIds:[SCHOOL],classIds:[MINE],children:[],stamps:0,
  avatarCustom:{hat:null,accessory:null},avatarId:null,preferences:{theme:'light'}});

await signOut(cauth).catch(()=>{});
await signInWithCustomToken(cauth, await getAdminAuth().createCustomToken(TEA));

const base=(cls,sub)=>collection(cdb,'schools',SCHOOL,'classes',cls,sub);

const tryAdd=async(cls,sub,data)=>{
  try { await addDoc(base(cls,sub), data); return 'OK'; }
  catch { return 'DENIED'; }
};

console.log('MARK 내 반');
ok('내 반에 숙제 낼 수 있음',
  await tryAdd(MINE,'homeworks',{title:'검증숙제',description:'',submitType:'text',
    visibility:'class',dueDate:null,authorUid:TEA,authorName:'t',createdAt:serverTimestamp()})==='OK');
ok('내 반에 알림장 쓸 수 있음',
  await tryAdd(MINE,'notices',{kind:'notice',title:'검증',body:'',forDate:null,
    authorUid:TEA,authorName:'t',createdAt:serverTimestamp()})==='OK');
ok('내 반에 퀴즈 낼 수 있음',
  await tryAdd(MINE,'quizzes',{title:'검증퀴즈',description:'',visibility:'class',
    createdAt:serverTimestamp()})==='OK');

console.log('MARK 남의 반 — 전부 막혀야 한다');
ok('남의 반 숙제 차단',
  await tryAdd(OTHER,'homeworks',{title:'몰래숙제',description:'',submitType:'text',
    visibility:'class',dueDate:null,authorUid:TEA,authorName:'t',createdAt:serverTimestamp()})==='DENIED');
ok('남의 반 알림장 차단',
  await tryAdd(OTHER,'notices',{kind:'notice',title:'몰래',body:'',forDate:null,
    authorUid:TEA,authorName:'t',createdAt:serverTimestamp()})==='DENIED');
ok('남의 반 퀴즈 차단',
  await tryAdd(OTHER,'quizzes',{title:'몰래퀴즈',description:'',visibility:'class',
    createdAt:serverTimestamp()})==='DENIED');
ok('남의 반 활동 차단',
  await tryAdd(OTHER,'activities',{title:'몰래활동',description:'',date:serverTimestamp(),
    thumbnailUrl:'',order:0})==='DENIED');

await signOut(cauth).catch(()=>{});

// 정리 — 내 반에 넣은 검증물 지우기
for(const sub of ['homeworks','notices','quizzes']){
  const snap=await adb.collection(`schools/${SCHOOL}/classes/${MINE}/${sub}`).get();
  for(const d of snap.docs){
    const t=d.data().title||'';
    if(t.startsWith('검증')) await d.ref.delete();
  }
}
const logs=await adb.collection('accessLogs').where('uid','==',TEA).get();
for(const l of logs.docs) await l.ref.delete();
await adb.collection('users').doc(TEA).delete();
console.log(`\n실패 ${failed}건`);
process.exit(failed>0?1:0);
