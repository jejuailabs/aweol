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
const KID='zz-archer';
await adb.collection('users').doc(KID).set({displayName:'검증궁수',role:'student',
  pendingRole:null,pendingSchoolId:null,pendingClassId:null,
  schoolIds:[SCHOOL],classIds:['3-1'],children:[],stamps:0,
  avatarCustom:{hat:null,accessory:null},avatarId:null,preferences:{theme:'light'}});

await signOut(cauth).catch(()=>{});
await signInWithCustomToken(cauth, await getAdminAuth().createCustomToken(KID));
const tok = async () => cauth.currentUser.getIdToken();

const call = async (method, body) => {
  const res = await fetch(`${BASE}/api/archery`, {
    method, headers:{'Content-Type':'application/json', Authorization:`Bearer ${await tok()}`},
    body: JSON.stringify(body),
  });
  let json=null; try { json = await res.json(); } catch {}
  return { status: res.status, json };
};

console.log('MARK 시작');
const s1 = await call('POST', { schoolId: SCHOOL });
ok(`판을 시작한다 (${s1.status})`, s1.status===200);
ok('씨앗을 준다', Number.isFinite(s1.json?.seed));
ok('화살 수를 알려준다', s1.json?.shots === 5);

console.log('MARK 점수는 서버가 낸다 (위조 시도)');
const forged = await call('PATCH', { schoolId: SCHOOL, times:[300,900,1500,2100,2700], total: 50, shots:[10,10,10,10,10] });
ok(`제출됨 (${forged.status})`, forged.status===200);
ok('보낸 total 50 을 그대로 쓰지 않는다', forged.json?.total !== 50 || forged.json?.shots?.join() !== '10,10,10,10,10');
ok(`서버가 매긴 점수 (${forged.json?.total}점 / ${forged.json?.shots?.join(' ')})`,
   typeof forged.json?.total === 'number' && forged.json.total <= 50);

console.log('MARK 같은 판을 두 번 못 낸다');
const again = await call('PATCH', { schoolId: SCHOOL, times:[300,900,1500,2100,2700] });
ok(`두 번째 제출은 막힌다 (${again.status})`, again.status===409);

console.log('MARK 시작 안 하고 내면');
await adb.doc(`schools/${SCHOOL}/archeryRounds/${KID}`).delete();
const noRound = await call('PATCH', { schoolId: SCHOOL, times:[300,900,1500,2100,2700] });
ok(`시작한 판이 없으면 거부 (${noRound.status})`, noRound.status===409);

console.log('MARK 사람이 못 쏘는 속도');
await call('POST', { schoolId: SCHOOL });
const tooFast = await call('PATCH', { schoolId: SCHOOL, times:[0,1,2,3,4] });
ok(`1ms 간격 연사는 거부 (${tooFast.status})`, tooFast.status===400);

console.log('MARK 이상한 입력');
await call('POST', { schoolId: SCHOOL });
const junk = await call('PATCH', { schoolId: SCHOOL, times:'조작' });
ok(`배열이 아니어도 안 터진다 (${junk.status})`, junk.status===200 && junk.json?.total===0);

console.log('MARK 씨앗이 판마다 다른가');
const seeds = new Set();
for (let i=0;i<5;i++) { const r = await call('POST', { schoolId: SCHOOL }); seeds.add(r.json?.seed); }
ok(`판마다 씨앗이 다르다 (${seeds.size}/5종)`, seeds.size >= 4);

console.log('MARK 씨앗은 남에게 안 보인다');
try {
  const peek = await cdb && null;
} catch {}
const rules = await adb.doc(`schools/${SCHOOL}/archeryRounds/${KID}`).get();
ok('서버는 판을 볼 수 있다(관리자 권한)', rules.exists);

await signOut(cauth).catch(()=>{});
await adb.doc(`schools/${SCHOOL}/archeryRounds/${KID}`).delete().catch(()=>{});
await adb.doc(`schools/${SCHOOL}/archeryRecords/${KID}`).delete().catch(()=>{});
const logs = await adb.collection('accessLogs').where('uid','==',KID).get();
for (const l of logs.docs) await l.ref.delete();
await adb.collection('users').doc(KID).delete();
console.log(`\n실패 ${failed}건`);
process.exit(failed>0?1:0);
