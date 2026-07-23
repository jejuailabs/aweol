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

/**
 * **만들 때 종류를 정할 수 있어야 한다.**
 *
 * 애월초등학교가 전시관으로 바뀌어 있던 사고(2026-07-23)의 원인이 이것이었다 —
 * 만드는 화면에 종류 칸이 없어서, 전시관을 열려면 **이미 있는 학교를 골라
 * 바꾸는 길밖에 없었다.** 그 길밖에 없으면 사람은 그 길로 간다.
 */
const createSchool = async (uid, name, kind) => {
  await signOut(cauth).catch(()=>{});
  await signInWithCustomToken(cauth, await getAdminAuth().createCustomToken(uid));
  const t = await cauth.currentUser.getIdToken();
  const form = new FormData();
  form.set('name', name);
  form.set('lat', '33.46'); form.set('lng', '126.33');
  form.set('gradeCount', '1'); form.set('classPerGrade', '1');
  if (kind) form.set('kind', kind);
  const res = await fetch(`${BASE}/api/school`, {
    method:'POST', headers:{ Authorization:`Bearer ${t}` }, body: form });
  return { status: res.status, json: await res.json().catch(()=>({})) };
};

const made = [];
const c1 = await createSchool(SUPER, `zz-kind-new-gallery-${Date.now()}`, 'gallery');
ok(`전시관을 새로 만들 수 있다 (${c1.status})`, c1.status===200 && !!c1.json.schoolId);
if (c1.json.schoolId) {
  made.push(c1.json.schoolId);
  const d = await adb.doc(`schools/${c1.json.schoolId}`).get();
  ok('만들자마자 kind 가 gallery 다', d.data()?.kind==='gallery');
}

const c2 = await createSchool(SUPER, `zz-kind-new-school-${Date.now()}`, null);
ok(`종류를 안 주면 학교다 (${c2.status})`, c2.status===200);
if (c2.json.schoolId) {
  made.push(c2.json.schoolId);
  ok('kind 가 school 이다', (await adb.doc(`schools/${c2.json.schoolId}`).get()).data()?.kind==='school');
}

// 담임이 전시관을 만들려 해도 막혀야 한다 (만드는 것 자체가 총관리자 권한)
const c3 = await createSchool(TEA, `zz-kind-teacher-${Date.now()}`, 'gallery');
ok(`담임은 아예 못 만든다 (${c3.status})`, c3.status===403);
if (c3.json.schoolId) made.push(c3.json.schoolId);

/**
 * **로그만 보고 무엇이 바뀌었는지 알 수 있어야 한다.**
 * 사고 당시 로그에는 '학교 정보 수정 · 애월초등학교' 라고만 적혀 있어서
 * 이름이 바뀐 건지 종류가 바뀐 건지 알 수 없었다.
 */
await patchKind(SUPER, 'gallery');
const logs = await adb.collection('accessLogs').where('uid','==',SUPER).get();
const kindLog = logs.docs.map(d=>d.data()).find(l=>l.action==='학교 종류 변경');
ok('종류를 바꾸면 로그가 그렇게 말한다', !!kindLog);
ok('로그에 무엇이 어떻게 바뀌었는지 적혀 있다',
  !!kindLog && /종류 school → gallery/.test(kindLog.detail || ''));
const madeLog = logs.docs.map(d=>d.data()).find(l=>l.action==='전시관 생성');
ok('전시관을 만들면 로그도 전시관이라고 적는다', !!madeLog);

await signOut(cauth).catch(()=>{});
for (const id of made) {
  const cs = await adb.collection(`schools/${id}/classes`).get();
  for (const d of cs.docs) await d.ref.delete();
  await adb.doc(`schools/${id}`).delete();
}
await adb.doc(`schools/${G}`).delete();
for (const u of [SUPER,TEA]) {
  const l = await adb.collection('accessLogs').where('uid','==',u).get();
  for (const d of l.docs) await d.ref.delete();
  await adb.collection('users').doc(u).delete();
}
console.log(`\n실패 ${failed}건`);
process.exit(failed>0?1:0);
