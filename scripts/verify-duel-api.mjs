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


const S='aewol-elementary';
const A='zz-duel-a', B='zz-duel-b', C='zz-duel-c';
const mk=(uid,name)=>adb.collection('users').doc(uid).set({displayName:name,role:'student',
  pendingRole:null,pendingSchoolId:null,pendingClassId:null,
  schoolIds:[S],classIds:['3-1'],children:[],stamps:0,
  avatarCustom:{hat:null,accessory:null},avatarId:null,preferences:{theme:'light'}});
await mk(A,'선수A'); await mk(B,'선수B'); await mk(C,'선수C');

const asUser = async (uid) => {
  await signOut(cauth).catch(()=>{});
  await signInWithCustomToken(cauth, await getAdminAuth().createCustomToken(uid));
  return cauth.currentUser.getIdToken();
};
const call = async (uid, body) => {
  const t = await asUser(uid);
  const res = await fetch(`${BASE}/api/archery-duel`, {
    method:'POST', headers:{'Content-Type':'application/json',Authorization:`Bearer ${t}`},
    body: JSON.stringify({schoolId:S, ...body}) });
  let j=null; try{ j=await res.json(); }catch{}
  return {status:res.status, json:j};
};
const roomDoc = (id) => adb.doc(`schools/${S}/archeryDuels/${id}`);

console.log('MARK 방 만들고 참가');
const created = await call(A, {action:'create'});
ok(`방 생성 (${created.status})`, created.status===200 && created.json.roomId && /^\d{4}$/.test(created.json.code));
const roomId = created.json.roomId, code = created.json.code;

const wrongJoin = await call(B, {action:'join', code:'0000'});
ok(`없는 번호는 거부 (${wrongJoin.status})`, wrongJoin.status===404);

const joined = await call(B, {action:'join', code});
ok(`상대 참가 (${joined.status})`, joined.status===200);
let d = (await roomDoc(roomId).get()).data();
ok('두 명 모여 playing 이 됐다', d.status==='playing' && d.players.length===2);

const third = await call(C, {action:'join', code});
ok(`꽉 찬 방은 못 들어온다 (${third.status})`, third.status===409 || third.status===404);

console.log('MARK 차례가 아니면 못 쏜다');
const wrongTurn = await call(B, {action:'shot', roomId, aimMs:500});
ok(`2번은 아직 못 쏜다 (${wrongTurn.status})`, wrongTurn.status===409);

console.log('MARK 번갈아 다섯 발씩');
// A 부터. aimMs 는 15초 안. 번갈아 10번.
let order=[];
for (let i=0;i<10;i++){
  d = (await roomDoc(roomId).get()).data();
  // 서버가 정한 차례를 그대로 따른다
  const { whoseTurn } = await import('../src/lib/archery-duel.ts');
  const turn = whoseTurn({players:d.players, size:d.size});
  order.push(turn===A?'a':'b');
  const r = await call(turn, {action:'shot', roomId, aimMs: 400 + i*30});
  if (r.status!==200){ ok(`${i}번째 격발 실패 (${r.status}: ${r.json?.error})`, false); break; }
}
ok('열 발 번갈아 돌았다 (ababababab)', order.join('')==='ababababab');
d = (await roomDoc(roomId).get()).data();
ok('둘 다 5발씩', d.players[0].shots.length===5 && d.players[1].shots.length===5);
ok('끝났다(done)', d.status==='done');
ok('점수는 0~10 사이', d.players.every(p=>p.shots.every(s=>s>=0&&s<=10)));
ok('꽂힌 자리(marks)도 쌓였다', d.players[0].marks.length===5);

console.log('MARK 15초 넘기면 0점');
const room2 = await call(A, {action:'create'});
await call(B, {action:'join', code: room2.json.code});
// turnStartedMs 를 20초 전으로 되돌려 시간 초과를 만든다
await roomDoc(room2.json.roomId).update({ turnStartedMs: Date.now() - 20000 });
const late = await call(A, {action:'shot', roomId: room2.json.roomId, aimMs: 500});
ok(`시간 초과 격발은 받되 (${late.status})`, late.status===200);
ok('0점 처리된다', late.json.score===0);

await signOut(cauth).catch(()=>{});
// 정리
for (const id of [roomId, room2.json.roomId]) await roomDoc(id).delete().catch(()=>{});
for (const u of [A,B,C]) {
  const l = await adb.collection('accessLogs').where('uid','==',u).get();
  for (const x of l.docs) await x.ref.delete();
  await adb.collection('users').doc(u).delete();
}
console.log(`\n실패 ${failed}건`);
process.exit(failed>0?1:0);
