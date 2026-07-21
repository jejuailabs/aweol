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


const G='zz-kind-school';
const SUPER='zz-kind-super', TEA='zz-kind-tea';
const mk=(uid,name,role,schoolIds)=>adb.collection('users').doc(uid).set({
  displayName:name,role,pendingRole:null,pendingSchoolId:null,pendingClassId:null,
  schoolIds,classIds:[],children:[],stamps:0,
  avatarCustom:{hat:null,accessory:null},avatarId:null,preferences:{theme:'light'}});
await adb.doc(`schools/${G}`).set({name:'검증관',lat:33,lng:126,imageUrl:'',tagline:'',
  gradeCount:1,classPerGrade:1,assets:[]});
await mk(SUPER,'총관리자','super_admin',[]);
await mk(TEA,'담임','teacher',[G]);

const patchKind = async (uid, kind) => {
  await signOut(cauth).catch(()=>{});
  await signInWithCustomToken(cauth, await getAdminAuth().createCustomToken(uid));
  const t = await cauth.currentUser.getIdToken();
  const form = new FormData();
  form.set('schoolId', G);
  form.set('kind', kind);
  const res = await fetch(`${BASE}/api/school`, {
    method:'PATCH', headers:{ Authorization:`Bearer ${t}` }, body: form });
  return res.status;
};

const s1 = await patchKind(SUPER,'gallery');
ok(`총관리자는 전시관으로 바꿀 수 있다 (${s1})`, s1===200);
const after = await adb.doc(`schools/${G}`).get();
ok('실제로 gallery 가 됐다', after.data().kind==='gallery');

const s2 = await patchKind(TEA,'school');
const after2 = await adb.doc(`schools/${G}`).get();
ok(`담임이 보내도 kind 는 안 바뀐다 (${s2})`, after2.data().kind==='gallery');

const s3 = await patchKind(SUPER,'school');
ok(`다시 학교로 되돌릴 수 있다 (${s3})`, s3===200);
ok('되돌아갔다', (await adb.doc(`schools/${G}`).get()).data().kind==='school');

await signOut(cauth).catch(()=>{});
await adb.doc(`schools/${G}`).delete();
for (const u of [SUPER,TEA]) {
  const l = await adb.collection('accessLogs').where('uid','==',u).get();
  for (const d of l.docs) await d.ref.delete();
  await adb.collection('users').doc(u).delete();
}
console.log(`\n실패 ${failed}건`);
process.exit(failed>0?1:0);
