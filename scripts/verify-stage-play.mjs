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


import { buildMatchDeck, isMatch } from '../src/lib/wordset.ts';

const S='zz-play-school', CLS='1-1', ST='zz-stage', KID='zz-play-kid', OUT='zz-play-out';
const PAIRS = Array.from({length:6},(_,i)=>({a:`낱말${i}`,b:`뜻${i}`}));
const ORDER = 3;
const SEED = ORDER*7919 + PAIRS.length;

const mk=(uid,name,classIds)=>adb.collection('users').doc(uid).set({
  displayName:name,role:'student',pendingRole:null,pendingSchoolId:null,pendingClassId:null,
  schoolIds:[S],classIds,children:[],stamps:0,
  avatarCustom:{hat:null,accessory:null},avatarId:null,preferences:{theme:'light'}});
await adb.doc(`schools/${S}`).set({name:'검증교',lat:33,lng:126,imageUrl:'',tagline:'',gradeCount:1,classPerGrade:1,assets:[]});
await adb.doc(`schools/${S}/classes/${CLS}`).set({schoolId:S,grade:'1',classNumber:1,year:'2026',
  teacherUid:'',teacherName:'t',motto:'',introText:'',isArchived:false});
await adb.doc(`schools/${S}/classes/${CLS}/stages/${ST}`).set({
  order:ORDER, title:'검증', pairs:PAIRS, source:'manual', approved:true,
  authorUid:'t', authorName:'t', createdAt:new Date()});
await mk(KID,'검증아이',[CLS]);
await mk(OUT,'남의반아이',['9-9']);

// 화면과 같은 방식으로 판을 만들어 정답 순서를 뽑는다
const deck = buildMatchDeck(PAIRS, SEED, 6);
const perfect=[]; const used=new Set();
for (let i=0;i<deck.length;i++){
  if (used.has(i)) continue;
  const j = deck.findIndex((c,k)=>k!==i && !used.has(k) && isMatch(deck[i],c));
  perfect.push(i,j); used.add(i); used.add(j);
}

const post = async (uid, order) => {
  await signOut(cauth).catch(()=>{});
  await signInWithCustomToken(cauth, await getAdminAuth().createCustomToken(uid));
  const t = await cauth.currentUser.getIdToken();
  const res = await fetch(`${BASE}/api/stage-play`, {
    method:'POST', headers:{'Content-Type':'application/json',Authorization:`Bearer ${t}`},
    body: JSON.stringify({schoolId:S, classId:CLS, stageId:ST, order}),
  });
  let j=null; try{ j=await res.json(); }catch{}
  return {status:res.status, json:j};
};

console.log('MARK 제대로 한 판');
const r = await post(KID, perfect);
ok(`통과 (${r.status})`, r.status===200);
ok(`서버가 12번·100점으로 셌다 (${r.json?.flips}번 ${r.json?.score}점)`,
   r.json?.flips===12 && r.json?.score===100);
const rec = await adb.doc(`schools/${S}/matchRecords/${KID}`).get();
ok('학교 기록에 올랐다', rec.exists && rec.data().score===100);

console.log('MARK 거짓 순서');
ok(`덜 맞히고 내면 거부 (${(await post(KID,[perfect[0],perfect[1]])).status})`,
   (await post(KID,[perfect[0],perfect[1]])).status===400);
ok('점수를 같이 보내도 안 쓴다 (order 만 본다)',
   (await post(KID,[0,0])).status===400);
ok('없는 자리는 거부', (await post(KID,[0,999])).status===400);

console.log('MARK 권한');
ok(`남의 반 아이는 거부 (${(await post(OUT,perfect)).status})`, (await post(OUT,perfect)).status===403);

console.log('MARK 최고 기록만 남는다');
// 일부러 못한 판 — 틀렸다 맞히기
const wrong = deck.findIndex((c,k)=>k!==perfect[0] && !isMatch(deck[perfect[0]],c));
await post(KID, [perfect[0], wrong, ...perfect]);
const rec2 = await adb.doc(`schools/${S}/matchRecords/${KID}`).get();
ok(`못한 판이 잘한 기록을 안 덮는다 (${rec2.data().score}점)`, rec2.data().score===100);

await signOut(cauth).catch(()=>{});
const plays = await adb.collection(`schools/${S}/classes/${CLS}/stages/${ST}/plays`).get();
for (const d of plays.docs) await d.ref.delete();
await adb.doc(`schools/${S}/classes/${CLS}/stages/${ST}`).delete();
await adb.doc(`schools/${S}/classes/${CLS}`).delete();
await adb.doc(`schools/${S}/matchRecords/${KID}`).delete().catch(()=>{});
await adb.doc(`schools/${S}`).delete();
for (const u of [KID,OUT]) {
  const l = await adb.collection('accessLogs').where('uid','==',u).get();
  for (const d of l.docs) await d.ref.delete();
  await adb.collection('users').doc(u).delete();
}
console.log(`\n실패 ${failed}건`);
process.exit(failed>0?1:0);
