/**
 * 마을 조사대 고치기 — 서버·규칙 검증.
 *
 * **화면에서만 막으면 막은 게 아니다.** 어드민 화면이 문제를 보여주긴 하지만,
 * 저장은 서버를 지나야 하고 서버가 한 번 더 전체를 본다.
 *
 * 실행: node scripts/verify-rpg-api.mjs   (서버가 떠 있어야 한다)
 */
import { readFileSync } from 'fs';
import { initializeApp as initAdmin, cert } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore as getAdminDb } from 'firebase-admin/firestore';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signOut } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';

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

const S = 'zz-rpg-school';
const TEA = 'zz-rpg-tea', KID = 'zz-rpg-kid', OTHER = 'zz-rpg-other';

const mk = (uid, name, role, schoolIds) => adb.collection('users').doc(uid).set({
  displayName: name, role, pendingRole: null, pendingSchoolId: null, pendingClassId: null,
  schoolIds, classIds: [], children: [], stamps: 0,
  avatarCustom: { hat: null, accessory: null }, avatarId: null, preferences: { theme: 'light' },
});

const wipe = async () => {
  for (const c of ['rpgSites', 'rpgPlaces', 'rpgQuests']) {
    const s = await adb.collection(`schools/${S}/${c}`).get();
    for (const d of s.docs) await d.ref.delete();
  }
};

await adb.doc(`schools/${S}`).set({
  name: '검증마을', lat: 33, lng: 126, imageUrl: '', tagline: '',
  gradeCount: 1, classPerGrade: 1, assets: [],
});
await mk(TEA, '담임', 'teacher', [S]);
await mk(KID, '아이', 'student', [S]);
await mk(OTHER, '남의학교 담임', 'teacher', ['zz-other-school']);
await wipe();

const asUser = async (uid) => {
  await signOut(cauth).catch(() => {});
  await signInWithCustomToken(cauth, await getAdminAuth().createCustomToken(uid));
  return cauth.currentUser.getIdToken();
};
const api = async (uid, body) => {
  const t = await asUser(uid);
  const res = await fetch(`${BASE}/api/rpg`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
    body: JSON.stringify({ schoolId: S, ...body }),
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
};

/** 성한 유적 하나 */
const goodSite = {
  name: '우리 마을 팽나무', emoji: '🌲', axis: 'life', era: null, dir: 'E', km: 0.2,
  open: true, oneLine: '마을 어귀에 오래된 나무가 있어요.',
  pages: [{ title: '언제부터', body: '아주 오래전부터 여기 있었어요. 마을 사람들이 지켰어요.' }],
  keywords: ['팽나무'], sources: [{ label: '마을회', url: 'https://example.com/a' }],
};

// ── 누가 고칠 수 있나 ────────────────────────────────────
const anon = await fetch(`${BASE}/api/rpg`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ schoolId: S, kind: 'sites', id: 'x-tree', value: goodSite }),
});
ok(`로그인 없이는 못 고친다 (${anon.status})`, anon.status === 401);

const byKid = await api(KID, { kind: 'sites', id: 'x-tree', value: goodSite });
ok(`아이는 못 고친다 (${byKid.status})`, byKid.status === 403);

const byOther = await api(OTHER, { kind: 'sites', id: 'x-tree', value: goodSite });
ok(`남의 학교 선생님은 못 고친다 (${byOther.status})`, byOther.status === 403);

const byTea = await api(TEA, { kind: 'sites', id: 'x-tree', value: goodSite });
ok(`우리 학교 선생님은 고칠 수 있다 (${byTea.status})`, byTea.status === 200);
ok('실제로 저장됐다', (await adb.doc(`schools/${S}/rpgSites/x-tree`).get()).exists);
ok('누가 고쳤는지 남는다',
  (await adb.doc(`schools/${S}/rpgSites/x-tree`).get()).data()?.updatedBy === TEA);

// ── 아이는 읽을 수 있어야 한다 ──────────────────────────
await asUser(KID);
ok('아이도 읽을 수는 있다',
  await getDoc(doc(cdb, `schools/${S}/rpgSites/x-tree`)).then((s) => s.exists()).catch(() => false));

/** **화면에서 직접 쓰지는 못한다** — 검사를 거쳐야 하니까 */
let denied = false;
await setDoc(doc(cdb, `schools/${S}/rpgSites/x-tree`), { value: goodSite }).catch(() => { denied = true; });
ok('선생님이라도 화면에서 직접은 못 쓴다 (서버를 거쳐야 한다)', denied);
await asUser(TEA);
denied = false;
await setDoc(doc(cdb, `schools/${S}/rpgSites/zz`), { value: goodSite }).catch(() => { denied = true; });
ok('선생님도 마찬가지다', denied);

// ── id 모양 ─────────────────────────────────────────────
for (const bad of ['한글아이디', 'Big-Id', 'a', 'a b']) {
  const r = await api(TEA, { kind: 'sites', id: bad, value: goodSite });
  ok(`이상한 id 는 막는다 (${bad})`, r.status === 400);
}

// ── 막다른 심부름을 막는가 ──────────────────────────────
const deadQuest = {
  chapter: 'time-travel', order: 9,
  giver: { placeKind: 'townhall', at: 0 },
  title: '없는 곳으로 보내기', ask: '없는 데 다녀오세요 정말로요', reward: '고마워요 잘 다녀왔군요',
  need: [{ kind: 'site', siteId: 'nowhere-at-all' }],
};
const r1 = await api(TEA, { kind: 'quests', id: 'zz-dead', value: deadQuest });
ok(`없는 곳으로 보내면 서버가 막는다 (${r1.status})`, r1.status === 400);
ok('무엇이 문제인지 알려준다',
  JSON.stringify(r1.json.problems ?? []).includes('없는 곳으로 보내요'));
ok('막혔으면 저장도 안 된다', !(await adb.doc(`schools/${S}/rpgQuests/zz-dead`).get()).exists);

const noPerson = {
  ...deadQuest,
  need: [],
  giver: { placeKind: 'townhall', at: 99 },
};
const r2 = await api(TEA, { kind: 'quests', id: 'zz-noone', value: noPerson });
ok(`없는 사람이 주는 심부름을 막는다 (${r2.status})`, r2.status === 400);

/**
 * **고리도 막는다.** 서로를 기다리면 둘 다 영원히 안 뜬다.
 * 하나씩 저장하니, 첫 번째는 통과하고 두 번째에서 걸려야 한다.
 */
const loopA = {
  chapter: 'time-travel', order: 9, giver: { placeKind: 'townhall', at: 0 },
  title: '고리 가', ask: '이건 나중에 하세요 알겠지요', reward: '잘했어요 정말 고마워요',
  need: [], unlock: [{ kind: 'quest', questId: 'zz-loop-b' }],
};
const loopB = { ...loopA, title: '고리 나', unlock: [{ kind: 'quest', questId: 'zz-loop-a' }] };
const ra = await api(TEA, { kind: 'quests', id: 'zz-loop-a', value: loopA });
ok(`없는 심부름을 가리키면 그것부터 막는다 (${ra.status})`, ra.status === 400);

// 진짜 고리를 만들려면 둘 다 있어야 하니, 관리자로 심어 두고 검사만 본다
await adb.doc(`schools/${S}/rpgQuests/zz-loop-a`).set({ value: loopA });
await adb.doc(`schools/${S}/rpgQuests/zz-loop-b`).set({ value: loopB });
const rb = await api(TEA, { kind: 'quests', id: 'zz-loop-b', value: loopB });
ok(`서로 기다리는 고리를 막는다 (${rb.status})`, rb.status === 400);
ok('안 열리는 심부름이라고 말해준다',
  JSON.stringify(rb.json.problems ?? []).includes('안 열려요'));
await adb.doc(`schools/${S}/rpgQuests/zz-loop-a`).delete();
await adb.doc(`schools/${S}/rpgQuests/zz-loop-b`).delete();

/** 기본값을 망가뜨리는 것도 막는다 — 사람을 지우면 그 사람이 주던 심부름이 걸린다 */
const townhall = {
  label: '읍사무소', emoji: '🏛️', color: '#8FA9C9', oneLine: '동네 살림을 맡아요 여기가 그곳이에요',
  people: [{ name: '민원 담당', emoji: '🧑', job: '서류를 떼어 줘요' }],
  todo: [], fixtures: ['flag'], guideAt: 0,
  guide: [{ title: '무엇을 하나요', body: '동네 살림을 맡아봐요.' }],
};
const r3 = await api(TEA, { kind: 'places', id: 'townhall', value: townhall });
ok(`심부름 주던 사람을 지우면 막는다 (${r3.status})`, r3.status === 400);

// ── 감추기와 되돌리기 ───────────────────────────────────
const hid = await api(TEA, { kind: 'sites', id: 'saebyeol', hidden: true });
ok(`유적을 감출 수 있다 (${hid.status})`, hid.status === 200);
ok('감춤으로 저장된다', (await adb.doc(`schools/${S}/rpgSites/saebyeol`).get()).data()?.hidden === true);

const back = await api(TEA, { kind: 'sites', id: 'saebyeol', reset: true });
ok(`기본값으로 되돌릴 수 있다 (${back.status})`, back.status === 200);
ok('되돌리면 저장한 것이 사라진다', !(await adb.doc(`schools/${S}/rpgSites/saebyeol`).get()).exists);

/**
 * **심부름이 걸려 있는 유적은 못 감춘다.**
 * 감추면 그리로 보내던 심부름이 막다른 길이 된다.
 * (검증 학교는 기본 유적을 안 쓰므로, 애월초 기준으로는 걸린다 —
 *  여기서는 '감추기도 검사를 지난다' 는 것만 본다)
 */
const hideUsed = await api(TEA, { kind: 'places', id: 'townhall', hidden: true });
ok(`심부름 주는 기관을 감추면 막는다 (${hideUsed.status})`, hideUsed.status === 400);

// ── 로그 ────────────────────────────────────────────────
const logs = await adb.collection('accessLogs').where('uid', '==', TEA).get();
const log = logs.docs.map((d) => d.data()).find((l) => l.action === '마을 조사대 수정');
ok('누가 무엇을 바꿨는지 로그에 남는다', !!log);
ok('무엇을 바꿨는지도 적혀 있다', !!log && /유적|기관|심부름/.test(log.detail || ''));

// ── 치우기 ──────────────────────────────────────────────
await signOut(cauth).catch(() => {});
await wipe();
await adb.doc(`schools/${S}`).delete();
for (const u of [TEA, KID, OTHER]) {
  const l = await adb.collection('accessLogs').where('uid', '==', u).get();
  for (const d of l.docs) await d.ref.delete();
  await adb.collection('users').doc(u).delete();
}

console.log(`\n실패 ${failed}건`);
process.exit(failed > 0 ? 1 : 0);
