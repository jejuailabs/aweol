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
const SA='zz-village-super';
await adb.collection('users').doc(SA).set({
  displayName:'총관리자', role:'super_admin',
  pendingRole:null,pendingSchoolId:null,pendingClassId:null,
  schoolIds:[],classIds:[],children:[],stamps:0,
  avatarCustom:{hat:null,accessory:null},avatarId:null,preferences:{theme:'light'},
});
const KID='zz-village-kid';
await adb.collection('users').doc(KID).set({
  displayName:'아이', role:'student',
  pendingRole:null,pendingSchoolId:null,pendingClassId:null,
  schoolIds:[],classIds:[],children:[],stamps:0,
  avatarCustom:{hat:null,accessory:null},avatarId:null,preferences:{theme:'light'},
});

const tokenFor=async(uid)=>{
  await signOut(cauth).catch(()=>{});
  await signInWithCustomToken(cauth, await getAdminAuth().createCustomToken(uid));
  return cauth.currentUser.getIdToken();
};
const call=(tok,b)=>fetch(`${BASE_URL_}/api/village`,{method:'POST',
  headers:{'Content-Type':'application/json',...(tok?{Authorization:`Bearer ${tok}`}:{})},
  body:JSON.stringify(b)});

console.log('[MARK 권한]');
let r=await call(null,{schoolId:SCHOOL});
ok('비로그인 거부', r.status===401, `HTTP ${r.status}`);
r=await call(await tokenFor(KID),{schoolId:SCHOOL});
ok('아이는 못 만듦', r.status===403, `HTTP ${r.status}`);

console.log('[MARK 만들기]');
const saToken=await tokenFor(SA);
r=await call(saToken,{schoolId:SCHOOL});
const j=await r.json();
ok('총관리자는 만들 수 있음', r.ok, `HTTP ${r.status} ${JSON.stringify(j).slice(0,80)}`);
if(r.ok){
  console.log('  건물', j.counts.buildings, '· 길', j.counts.roads, '· 물/공원', j.counts.areas);
  console.log('  이름:', (j.named||[]).join(', '));
  ok('건물이 있음', j.counts.buildings>0, String(j.counts.buildings));
  ok('길이 있음', j.counts.roads>0, String(j.counts.roads));

  const res=await fetch(j.villageUrl);
  ok('아이도 파일을 받을 수 있음', res.ok, `HTTP ${res.status}`);
  const raw=await res.text();
  const v=JSON.parse(raw);
  console.log(`  파일 크기 ${(raw.length/1024).toFixed(1)}KB`);
  ok('파일이 작음 (50KB 미만)', raw.length<50*1024, `${(raw.length/1024).toFixed(1)}KB`);

  const xs=[...v.b.flatMap(b=>b.p.map(p=>p[0])),...v.rd.flatMap(r=>r.p.map(p=>p[0]))];
  const zs=[...v.b.flatMap(b=>b.p.map(p=>p[1])),...v.rd.flatMap(r=>r.p.map(p=>p[1]))];
  const w=Math.max(...xs)-Math.min(...xs), h=Math.max(...zs)-Math.min(...zs);
  console.log(`  걸어다닐 크기 ${w.toFixed(0)}m x ${h.toFixed(0)}m`);
  ok('반경 밖이 잘려 있음', w<=v.r*2+1 && h<=v.r*2+1, `${w.toFixed(0)}x${h.toFixed(0)} (한계 ${v.r*2})`);

  const saved=(await adb.doc(`schools/${SCHOOL}`).get()).data()?.villageUrl;
  ok('학교 문서에 주소가 남음', !!saved);
}

await signOut(cauth).catch(()=>{});
for(const uid of [SA,KID]){
  const logs=await adb.collection('accessLogs').where('uid','==',uid).get();
  for(const l of logs.docs) await l.ref.delete();
  await adb.collection('users').doc(uid).delete();
}
console.log(`\n실패 ${failed}건`);
process.exit(failed>0?1:0);
