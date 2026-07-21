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
const HW='zz-stamp-hw';
const TEA='zz-stamp-teacher';
const OTHER='zz-stamp-other-teacher';
const KID='zz-stamp-kid';
const STAMP='custom-9999';

const mkUser=(uid,name,role,classIds)=>adb.collection('users').doc(uid).set({
  displayName:name,role,pendingRole:null,pendingSchoolId:null,pendingClassId:null,
  schoolIds:[SCHOOL],classIds,children:[],stamps:0,
  avatarCustom:{hat:null,accessory:null},avatarId:null,preferences:{theme:'light'}});

await mkUser(TEA,'도장선생님','teacher',[CLS]);
await mkUser(OTHER,'다른선생님','teacher',[CLS]);
await mkUser(KID,'도장아이','student',[CLS]);

// 선생님이 도장 하나를 만들어 뒀다고 치고
await adb.doc(`users/${TEA}/stamps/${STAMP}`).set({
  label:'참잘했어요', imageUrl:'https://example.com/stamp.jpg', createdAt:new Date(),
});

await adb.doc(`schools/${SCHOOL}/classes/${CLS}/homeworks/${HW}`).set({
  title:'[검증] 도장 테스트', description:'', submitType:'text',
  visibility:'class', dueDate:null, authorUid:TEA, authorName:'t', createdAt:new Date(),
});
await adb.doc(`schools/${SCHOOL}/classes/${CLS}/homeworks/${HW}/submissions/${KID}`).set({
  studentUid:KID, studentName:'도장아이', type:'text', text:'했어요',
  imageUrl:'', videoUrl:'', publicToClass:false, teacherComment:'',
  checked:false, checkedAt:null, stamp:null, awarded:false, submittedAt:new Date(),
});

const asUser = async (uid) => {
  await signOut(cauth).catch(()=>{});
  await signInWithCustomToken(cauth, await getAdminAuth().createCustomToken(uid));
  return cauth.currentUser.getIdToken();
};
const stampWith = async (uid, stampId) => {
  const t = await asUser(uid);
  const res = await fetch(`${BASE}/api/homework`, {
    method:'PATCH',
    headers:{'Content-Type':'application/json', Authorization:`Bearer ${t}`},
    body: JSON.stringify({schoolId:SCHOOL, classId:CLS, homeworkId:HW, studentUid:KID, check:true, stampId}),
  });
  return res.status;
};

const s1 = await stampWith(TEA, STAMP);
ok(`내가 만든 도장을 찍을 수 있다 (${s1})`, s1 === 200);
const sub = await adb.doc(`schools/${SCHOOL}/classes/${CLS}/homeworks/${HW}/submissions/${KID}`).get();
const st = sub.data().stamp || {};
ok('제출물에 도장 그림이 복사됐다', st.imageUrl === 'https://example.com/stamp.jpg');
ok('이름도 같이 복사됐다', st.label === '참잘했어요');

const s2 = await stampWith(OTHER, STAMP);
ok(`남의 도장은 못 찍는다 (${s2})`, s2 === 403);

const s3 = await stampWith(TEA, 'custom-없는것');
ok(`없는 도장은 거부된다 (${s3})`, s3 === 403);

// 도장을 지워도 이미 찍힌 것은 남아야 한다
await adb.doc(`users/${TEA}/stamps/${STAMP}`).delete();
const after = await adb.doc(`schools/${SCHOOL}/classes/${CLS}/homeworks/${HW}/submissions/${KID}`).get();
ok('도장을 지워도 아이가 받은 도장은 남는다',
   (after.data().stamp||{}).imageUrl === 'https://example.com/stamp.jpg');

await signOut(cauth).catch(()=>{});
// 정리
const subs = await adb.collection(`schools/${SCHOOL}/classes/${CLS}/homeworks/${HW}/submissions`).get();
for (const d of subs.docs) await d.ref.delete();
await adb.doc(`schools/${SCHOOL}/classes/${CLS}/homeworks/${HW}`).delete();
for (const u of [TEA, OTHER, KID]) {
  for (const sub2 of ['stamps','inventory','stampLedger']) {
    const c = await adb.collection(`users/${u}/${sub2}`).get();
    for (const d of c.docs) await d.ref.delete();
  }
  const logs = await adb.collection('accessLogs').where('uid','==',u).get();
  for (const l of logs.docs) await l.ref.delete();
  await adb.collection('users').doc(u).delete();
}
console.log(`\n실패 ${failed}건`);
process.exit(failed>0?1:0);
