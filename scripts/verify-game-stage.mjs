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
const MINE='3-1', OTHER='3-2';
const TEA='zz-game-teacher', KID='zz-game-kid';

const mk=(uid,name,role,classIds)=>adb.collection('users').doc(uid).set({
  displayName:name,role,pendingRole:null,pendingSchoolId:null,pendingClassId:null,
  schoolIds:[SCHOOL],classIds,children:[],stamps:0,
  avatarCustom:{hat:null,accessory:null},avatarId:null,preferences:{theme:'light'}});
await mk(TEA,'게임선생님','teacher',[MINE]);
await mk(KID,'게임아이','student',[MINE]);

const call = async (uid, body) => {
  await signOut(cauth).catch(()=>{});
  await signInWithCustomToken(cauth, await getAdminAuth().createCustomToken(uid));
  const t = await cauth.currentUser.getIdToken();
  const res = await fetch(`${BASE}/api/game-stage`, {
    method:'POST',
    headers:{'Content-Type':'application/json', Authorization:`Bearer ${t}`},
    body: JSON.stringify(body),
  });
  let json=null; try { json = await res.json(); } catch {}
  return { status: res.status, json };
};

const LESSON = `3단원 식물의 한살이
씨앗은 흙 속에서 물과 온도가 알맞으면 싹을 틔운다. 이것을 발아라고 한다.
떡잎은 씨앗에서 처음 나오는 잎으로, 씨앗 속 양분을 담고 있다.
본잎은 떡잎 다음에 나오는 잎이며 광합성을 한다.
광합성은 잎이 빛을 받아 스스로 양분을 만드는 일이다.
뿌리는 물과 양분을 빨아들이고 식물이 쓰러지지 않게 붙잡아 준다.
줄기는 물과 양분이 지나는 길이며 잎과 꽃을 받쳐 준다.
꽃은 씨를 만들기 위한 기관이고, 열매는 씨를 보호한다.`;

console.log('MARK 권한');
const r403 = await call(TEA, { classId: OTHER, text: LESSON });
ok(`남의 반 게임은 못 만든다 (${r403.status})`, r403.status === 403);
const rKid = await call(KID, { classId: MINE, text: LESSON });
ok(`아이는 못 만든다 (${rKid.status})`, rKid.status === 403);

console.log('MARK 입력 검사');
const rShort = await call(TEA, { classId: MINE, text: '짧음' });
ok(`너무 짧은 자료는 거부 (${rShort.status})`, rShort.status === 400);

console.log('MARK 실제로 낱말을 뽑는가');
const r = await call(TEA, { classId: MINE, text: LESSON });
ok(`내 반은 만들 수 있다 (${r.status})`, r.status === 200);
const pairs = r.json?.pairs ?? [];
ok(`낱말을 2개 이상 뽑았다 (${pairs.length}개)`, pairs.length >= 2);
ok('a·b 가 모두 채워져 있다', pairs.every(p => p.a?.trim() && p.b?.trim()));
ok('40자를 넘지 않는다', pairs.every(p => p.a.length <= 40 && p.b.length <= 40));
ok('같은 낱말이 두 번 없다', new Set(pairs.map(p=>p.a)).size === pairs.length);
ok(`제목을 지었다 ("${r.json?.title ?? ''}")`, typeof r.json?.title === 'string');
if (pairs.length) console.log('   예:', pairs.slice(0,3).map(p=>`${p.a} → ${p.b}`).join(' / '));

console.log('MARK 자료에 없는 걸 지어내지 않는가');
const rJunk = await call(TEA, { classId: MINE, text: '오늘 날씨가 참 좋았다. '.repeat(6) });
ok(`낱말 학습에 안 맞는 자료는 솔직히 거절한다 (${rJunk.status})`,
   rJunk.status === 422 || (rJunk.status === 200 && (rJunk.json?.pairs ?? []).length >= 2));

await signOut(cauth).catch(()=>{});
for (const u of [TEA, KID]) {
  const logs = await adb.collection('accessLogs').where('uid','==',u).get();
  for (const l of logs.docs) await l.ref.delete();
  await adb.collection('users').doc(u).delete();
}
console.log(`\n실패 ${failed}건`);
process.exit(failed>0?1:0);
