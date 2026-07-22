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


import { shotSetup, aimAt } from '../src/lib/archery.ts';
const S='aewol-elementary', KID='zz-lvl-kid';
await adb.collection('users').doc(KID).set({displayName:'난이도',role:'student',
  pendingRole:null,pendingSchoolId:null,pendingClassId:null,
  schoolIds:[S],classIds:['3-1'],children:[],stamps:0,
  avatarCustom:{hat:null,accessory:null},avatarId:null,preferences:{theme:'light'}});
await signOut(cauth).catch(()=>{});
await signInWithCustomToken(cauth, await getAdminAuth().createCustomToken(KID));
const tok=()=>cauth.currentUser.getIdToken();

// 각 난이도로 판을 시작하고, '완벽 타이밍'(중앙 지나는 순간)으로 5발 쏜다.
// 서버가 그 난이도로 채점하는지 본다.
const play = async (level) => {
  let t=await tok();
  const start = await fetch(`${BASE}/api/archery`, {method:'POST',
    headers:{'Content-Type':'application/json',Authorization:`Bearer ${t}`},
    body: JSON.stringify({schoolId:S, level})});
  const sj = await start.json();
  const seed = sj.seed;
  // 화면과 같은 방식으로 각 화살의 완벽 타이밍을 찾는다
  const times=[];
  for (let i=0;i<5;i++){
    const s = shotSetup(seed, i, level);
    let bestT=0,bestD=1e9;
    for (let tt=300;tt<4000;tt+=8){const p=aimAt(s,tt);const d=Math.hypot(p.x,p.y);if(d<bestD){bestD=d;bestT=tt;}}
    times.push(bestT);
  }
  t=await tok();
  const res = await fetch(`${BASE}/api/archery`, {method:'PATCH',
    headers:{'Content-Type':'application/json',Authorization:`Bearer ${t}`},
    body: JSON.stringify({schoolId:S, times})});
  const j = await res.json();
  return j.total;
};

console.log('MARK 완벽 타이밍이면 난이도와 무관하게 높다(중앙을 지나니까)');
const pe=await play('easy'), pn=await play('normal'), ph=await play('hard');
console.log(`   완벽 타이밍 총점 — 쉬움 ${pe} · 보통 ${pn} · 어려움 ${ph}`);
ok('완벽하면 셋 다 40점 이상 나온다', pe>=40 && pn>=40 && ph>=40);

console.log('MARK 서버가 난이도를 되짚는다 (일부러 늦게 쏨)');
// 완벽 타이밍 + 120ms 늦게. 어려움일수록 총점이 낮아야 한다.
const playLate = async (level, late) => {
  let t=await tok();
  const start = await fetch(`${BASE}/api/archery`, {method:'POST',
    headers:{'Content-Type':'application/json',Authorization:`Bearer ${t}`},
    body: JSON.stringify({schoolId:S, level})});
  const seed=(await start.json()).seed;
  const times=[];
  for (let i=0;i<5;i++){
    const s=shotSetup(seed,i,level);
    let bestT=0,bestD=1e9;
    for (let tt=300;tt<4000;tt+=8){const p=aimAt(s,tt);const d=Math.hypot(p.x,p.y);if(d<bestD){bestD=d;bestT=tt;}}
    times.push(bestT+late);
  }
  t=await tok();
  const res=await fetch(`${BASE}/api/archery`,{method:'PATCH',
    headers:{'Content-Type':'application/json',Authorization:`Bearer ${t}`},
    body:JSON.stringify({schoolId:S,times})});
  return (await res.json()).total;
};
const le=await playLate('easy',120), ln=await playLate('normal',120), lh=await playLate('hard',120);
console.log(`   120ms 늦게 — 쉬움 ${le} · 보통 ${ln} · 어려움 ${lh}`);
ok('늦으면 어려움이 쉬움보다 낮다', le > lh);

await signOut(cauth).catch(()=>{});
await adb.doc(`schools/${S}/archeryRounds/${KID}`).delete().catch(()=>{});
await adb.doc(`schools/${S}/archeryRecords/${KID}`).delete().catch(()=>{});
const l=await adb.collection('accessLogs').where('uid','==',KID).get();
for (const d of l.docs) await d.ref.delete();
await adb.collection('users').doc(KID).delete();
console.log(`\n실패 ${failed}건`);
process.exit(failed>0?1:0);
