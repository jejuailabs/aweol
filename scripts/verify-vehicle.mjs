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


const KID='zz-veh-kid';
await adb.collection('users').doc(KID).set({displayName:'탈것아이',role:'student',
  pendingRole:null,pendingSchoolId:null,pendingClassId:null,
  schoolIds:['aewol-elementary'],classIds:['3-1'],children:[],stamps:50,
  avatarCustom:{hat:null,accessory:null,vehicle:null},avatarId:null,preferences:{theme:'light'}});

await signOut(cauth).catch(()=>{});
await signInWithCustomToken(cauth, await getAdminAuth().createCustomToken(KID));
const call = async (body) => {
  const t = await cauth.currentUser.getIdToken();
  const res = await fetch(`${BASE}/api/shop`, {
    method:'POST', headers:{'Content-Type':'application/json',Authorization:`Bearer ${t}`},
    body: JSON.stringify(body) });
  let j=null; try{ j=await res.json(); }catch{}
  return {status:res.status, json:j};
};

console.log('MARK 안 산 탈것은 못 낀다');
const noBuy = await call({action:'equip', slot:'vehicle', itemId:'vehicle-rocket'});
ok(`안 가진 탈것 착용은 거부 (${noBuy.status})`, noBuy.status===403);

console.log('MARK 사고 낀다');
const buy = await call({action:'buy', itemId:'vehicle-scooter'});
ok(`킥보드 구매 (${buy.status})`, buy.status===200);
const inv = await adb.doc(`users/${KID}/inventory/vehicle-scooter`).get();
ok('인벤토리에 들어갔다', inv.exists);
const eq = await call({action:'equip', slot:'vehicle', itemId:'vehicle-scooter'});
ok(`가진 탈것은 착용된다 (${eq.status})`, eq.status===200);
const u = await adb.doc(`users/${KID}`).get();
ok('avatarCustom.vehicle 에 저장됐다', u.data().avatarCustom.vehicle==='vehicle-scooter');

console.log('MARK 잔액 검사 (위조 방지)');
const st = (await adb.doc(`users/${KID}`).get()).data().stamps;
ok(`살 때 도장이 깎였다 (${st})`, st === 50 - 6);
await adb.doc(`users/${KID}`).update({stamps:0});
const broke = await call({action:'buy', itemId:'vehicle-rocket'});
ok(`도장 없으면 못 산다 (${broke.status})`, broke.status===403 || broke.status===400);
ok('로켓카는 인벤토리에 안 들어갔다', !(await adb.doc(`users/${KID}/inventory/vehicle-rocket`).get()).exists);

console.log('MARK 해제');
const off = await call({action:'equip', slot:'vehicle', itemId:null});
ok(`탈것 빼기 (${off.status})`, off.status===200);
ok('기본 자동차로 돌아갔다', (await adb.doc(`users/${KID}`).get()).data().avatarCustom.vehicle===null);

await signOut(cauth).catch(()=>{});
for (const sub of ['inventory','stampLedger']) {
  const c = await adb.collection(`users/${KID}/${sub}`).get();
  for (const d of c.docs) await d.ref.delete();
}
const logs = await adb.collection('accessLogs').where('uid','==',KID).get();
for (const d of logs.docs) await d.ref.delete();
await adb.collection('users').doc(KID).delete();
console.log(`\n실패 ${failed}건`);
process.exit(failed>0?1:0);
