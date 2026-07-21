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


const S='zz-bb-school', CLS='1-1';
const TEA='zz-bb-tea', A='zz-bb-a', B='zz-bb-b';
const mk=(uid,name,role,classIds)=>adb.collection('users').doc(uid).set({
  displayName:name,role,pendingRole:null,pendingSchoolId:null,pendingClassId:null,
  schoolIds:[S],classIds,children:[],stamps:0,
  avatarCustom:{hat:null,accessory:null},avatarId:null,preferences:{theme:'light'}});
await adb.doc(`schools/${S}`).set({name:'검증교',lat:33,lng:126,imageUrl:'',tagline:'',gradeCount:1,classPerGrade:1,assets:[]});
await adb.doc(`schools/${S}/classes/${CLS}`).set({schoolId:S,grade:'1',classNumber:1,year:'2026',
  teacherUid:TEA,teacherName:'담임',motto:'',introText:'',isArchived:false});
await mk(TEA,'담임','teacher',[CLS]);
await mk(A,'아이A','student',[CLS]);
await mk(B,'아이B','student',[CLS]);

const as = async (uid) => {
  await signOut(cauth).catch(()=>{});
  await signInWithCustomToken(cauth, await getAdminAuth().createCustomToken(uid));
  return cauth.currentUser.getIdToken();
};
const write = async (uid, text) => {
  const t = await as(uid);
  const res = await fetch(`${BASE}/api/blackboard`, {
    method:'POST', headers:{'Content-Type':'application/json',Authorization:`Bearer ${t}`},
    body: JSON.stringify({schoolId:S, classId:CLS, kind:'text', text, points:[[0.5,0.5]]}),
  });
  const j = await res.json().catch(()=>({}));
  return j.id;
};
const del = async (uid, itemId) => {
  const t = await as(uid);
  const url = itemId
    ? `${BASE}/api/blackboard?schoolId=${S}&classId=${CLS}&itemId=${itemId}`
    : `${BASE}/api/blackboard?schoolId=${S}&classId=${CLS}`;
  const res = await fetch(url, { method:'DELETE', headers:{Authorization:`Bearer ${t}`} });
  return res.status;
};

const idA = await write(A, 'A가 쓴 글');
const idB = await write(B, 'B가 쓴 글');
ok('글이 써졌다', !!idA && !!idB);

console.log('MARK 한 개 지우기');
ok(`남의 글은 못 지운다 (${await del(A, idB)})`, await del(A, idB) === 403);
const stillB = await adb.doc(`schools/${S}/classes/${CLS}/blackboard/${idB}`).get();
ok('거부됐으면 남아 있다', stillB.exists);
ok(`내 글은 지운다 (${await del(A, idA)})`, true);
const goneA = await adb.doc(`schools/${S}/classes/${CLS}/blackboard/${idA}`).get();
ok('실제로 지워졌다', !goneA.exists);
ok(`담임은 남의 글도 지운다 (${await del(TEA, idB)})`, true);
ok('그것도 지워졌다', !(await adb.doc(`schools/${S}/classes/${CLS}/blackboard/${idB}`).get()).exists);
ok(`이미 지워진 걸 또 지우면 404 (${await del(TEA, idA)})`, await del(TEA, idA) === 404);

console.log('MARK 전체 지우기는 담임만');
await write(A, '남은 글');
ok(`아이는 전체 지우기 거부 (${await del(A, null)})`, await del(A, null) === 403);
const left = await adb.collection(`schools/${S}/classes/${CLS}/blackboard`).get();
ok('거부됐으면 그대로 있다', left.size >= 1);
ok(`담임은 전체 지운다 (${await del(TEA, null)})`, true);
ok('칠판이 비었다', (await adb.collection(`schools/${S}/classes/${CLS}/blackboard`).get()).empty);

await signOut(cauth).catch(()=>{});
const bb = await adb.collection(`schools/${S}/classes/${CLS}/blackboard`).get();
for (const d of bb.docs) await d.ref.delete();
await adb.doc(`schools/${S}/classes/${CLS}`).delete();
await adb.doc(`schools/${S}`).delete();
for (const u of [TEA,A,B]) {
  const l = await adb.collection('accessLogs').where('uid','==',u).get();
  for (const d of l.docs) await d.ref.delete();
  await adb.collection('users').doc(u).delete();
}
console.log(`\n실패 ${failed}건`);
process.exit(failed>0?1:0);
