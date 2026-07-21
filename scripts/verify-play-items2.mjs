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
const CLASS='3-1';
const GAME='zz-lens-game';
const KID='zz-lens-kid';
const BASE_URL_=process.env.BASE_URL||'http://localhost:3000';
await adb.collection('users').doc(KID).set({
  displayName:'돋보기아이', role:'student',
  pendingRole:null,pendingSchoolId:null,pendingClassId:null,
  schoolIds:[],classIds:[CLASS],children:[],stamps:10,
  avatarCustom:{hat:null,accessory:null},avatarId:null,preferences:{theme:'light'},
});

const gRef=adb.doc(`schools/${SCHOOL}/classes/${CLASS}/spotGames/${GAME}`);
await gRef.set({
  title:'돋보기 검증', originalUrl:'https://x/a.png', variantUrl:'https://x/b.png',
  layout:'side', spotCount:3, authorUid:'t', authorName:'t', createdAt:new Date(),
});
await gRef.collection('answerKey').doc('spots').set({
  spots:[{x:0.2,y:0.2,r:0.07},{x:0.5,y:0.5,r:0.07},{x:0.8,y:0.8,r:0.07}],
});

await signInWithCustomToken(cauth, await getAdminAuth().createCustomToken(KID));
const token=await cauth.currentUser.getIdToken();
const spot=(b)=>fetch(`${BASE_URL_}/api/spot-game`,{method:'PUT',
  headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
  body:JSON.stringify({schoolId:SCHOOL,classId:CLASS,gameId:GAME,...b})});
const shop=(b)=>fetch(`${BASE_URL_}/api/shop`,{method:'POST',
  headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
  body:JSON.stringify(b)});
const play=()=>gRef.collection('plays').doc(KID).get().then(d=>d.data());

console.log('[MARK 힌트 권한]');
let r=await spot({action:'hint'});
ok('시작 전에는 힌트 못 받음', r.status===409, `HTTP ${r.status}`);

await spot({action:'start'});
r=await spot({action:'hint'});
let j=await r.json();
ok('시작 후 힌트를 받음', r.ok, `HTTP ${r.status}`);
ok('좌표를 하나 알려줌', !!j.spot && typeof j.spot.x==='number', JSON.stringify(j.spot));
ok('찾은 개수가 1', j.foundCount===1, String(j.foundCount));

console.log('[MARK 기록에 표시]');
ok('돋보기 쓴 표시가 남음', (await play())?.hints===1, String((await play())?.hints));

r=await spot({action:'hint'});
j=await r.json();
ok('두 번째 힌트도 다른 곳', j.foundCount===2, String(j.foundCount));
ok('쓴 횟수가 2', (await play())?.hints===2, String((await play())?.hints));

console.log('[MARK 다 찾으면]');
r=await spot({action:'hint'});
j=await r.json();
ok('마지막 힌트로 완료', j.done===true, JSON.stringify(j.done));
ok('시간이 기록됨', typeof (await play())?.seconds==='number', String((await play())?.seconds));
r=await spot({action:'hint'});
ok('다 찾은 뒤에는 힌트 없음', r.status===409, `HTTP ${r.status}`);

console.log('[MARK 상점 연결]');
r=await shop({action:'buy',itemId:'play-lens'});
ok('돋보기를 살 수 있음', r.ok, `HTTP ${r.status}`);
r=await shop({action:'buy',itemId:'play-cloud'});
ok('구름 신발을 살 수 있음', r.ok, `HTTP ${r.status}`);
r=await shop({action:'use',itemId:'play-cloud'});
ok('구름 신발을 쓸 수 있음', r.ok, `HTTP ${r.status}`);
r=await shop({action:'use',itemId:'play-cloud'});
ok('없으면 못 씀', r.status===409, `HTTP ${r.status}`);

await signOut(cauth).catch(()=>{});
for(const c of ['answerKey','plays']){
  for(const d of (await gRef.collection(c).get()).docs) await d.ref.delete();
}
await gRef.delete();
for(const d of (await adb.collection(`users/${KID}/inventory`).get()).docs) await d.ref.delete();
for(const d of (await adb.collection(`users/${KID}/stampLedger`).get()).docs) await d.ref.delete();
const logs=await adb.collection('accessLogs').where('uid','==',KID).get();
for(const l of logs.docs) await l.ref.delete();
await adb.collection('users').doc(KID).delete();

console.log(`\n실패 ${failed}건`);
process.exit(failed>0?1:0);
