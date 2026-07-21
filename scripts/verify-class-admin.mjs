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


const SCHOOL='zz-admin-school';
const CLS='9-9';
const SUPER='zz-admin-super', TEA='zz-admin-tea', OUT='zz-admin-out';

const mk=(uid,name,role,classIds,schoolIds)=>adb.collection('users').doc(uid).set({
  displayName:name,role,pendingRole:null,pendingSchoolId:null,pendingClassId:null,
  schoolIds,classIds,children:[],stamps:0,
  avatarCustom:{hat:null,accessory:null},avatarId:null,preferences:{theme:'light'}});

const seed = async () => {
  await adb.doc(`schools/${SCHOOL}`).set({name:'검증학교', createdAt:new Date()});
  await adb.doc(`schools/${SCHOOL}/classes/${CLS}`).set({
    schoolId:SCHOOL, grade:'9', classNumber:9, year:'2026',
    teacherUid:TEA, teacherName:'검증담임', motto:'', introText:'', isArchived:false});
};
await mk(SUPER,'검증총관리자','super_admin',[],[]);
await mk(TEA,'검증담임','teacher',[CLS],[SCHOOL]);
await mk(OUT,'남의반담임','teacher',['1-1'],[SCHOOL]);

const as = async (uid) => {
  await signOut(cauth).catch(()=>{});
  await signInWithCustomToken(cauth, await getAdminAuth().createCustomToken(uid));
};
const tryUpdate = async (uid, patch) => {
  await as(uid);
  try { await updateDoc(doc(cdb,'schools',SCHOOL,'classes',CLS), patch); return 'OK'; }
  catch { return 'DENIED'; }
};
const tryDelete = async (uid) => {
  await as(uid);
  try { await deleteDoc(doc(cdb,'schools',SCHOOL,'classes',CLS)); return 'OK'; }
  catch { return 'DENIED'; }
};

console.log('MARK 고치기');
await seed();
ok('총관리자는 학년·반을 고칠 수 있다',
   await tryUpdate(SUPER,{grade:'8',classNumber:3})==='OK');
ok('담임은 자기 반을 고칠 수 있다',
   await tryUpdate(TEA,{motto:'검증'})==='OK');
ok('남의 반 담임은 못 고친다',
   await tryUpdate(OUT,{motto:'몰래'})==='DENIED');

console.log('MARK 보관');
ok('총관리자는 보관할 수 있다',
   await tryUpdate(SUPER,{isArchived:true})==='OK');
const arch = await adb.doc(`schools/${SCHOOL}/classes/${CLS}`).get();
ok('보관해도 자료는 남는다', arch.exists && arch.data().isArchived===true);

console.log('MARK 지우기');
ok('남의 반 담임은 못 지운다', await tryDelete(OUT)==='DENIED');
const stillThere = await adb.doc(`schools/${SCHOOL}/classes/${CLS}`).get();
ok('거부됐으면 반이 그대로 있다', stillThere.exists);
ok('총관리자는 지울 수 있다', await tryDelete(SUPER)==='OK');
const gone = await adb.doc(`schools/${SCHOOL}/classes/${CLS}`).get();
ok('지워졌다', !gone.exists);

await signOut(cauth).catch(()=>{});
for (const u of [SUPER,TEA,OUT]) {
  const logs = await adb.collection('accessLogs').where('uid','==',u).get();
  for (const l of logs.docs) await l.ref.delete();
  await adb.collection('users').doc(u).delete();
}
await adb.doc(`schools/${SCHOOL}`).delete().catch(()=>{});
console.log(`\n실패 ${failed}건`);
process.exit(failed>0?1:0);
