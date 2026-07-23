/**
 * 학부모 계정에 `childClassIds`(자녀 반을 평평하게 적은 목록)를 채운다.
 *
 * 보안 규칙은 `children` 같은 **객체 배열에서 classId 만 뽑아낼 수 없다.**
 * 그래서 '우리 반만 보기' 전시실 판정에 쓸 평평한 목록이 따로 필요하고,
 * 이게 없는 옛 학부모 계정은 **자녀 전시를 못 본다.**
 *
 * 앞으로 연결되는 학부모는 `/api/student-code` 가 함께 적는다. 이 스크립트는
 * 그 전에 연결한 사람들 몫이다. 여러 번 돌려도 안전하다.
 *
 * 실행: node scripts/backfill-parent-classes.mjs        (무엇이 바뀔지만 본다)
 *       node scripts/backfill-parent-classes.mjs --apply
 */
import { readFileSync } from 'fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const APPLY = process.argv.includes('--apply');

const env = {};
for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}
initializeApp({
  credential: cert({
    projectId: env.FIREBASE_ADMIN_PROJECT_ID,
    clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/^"|"$/g, '').replace(/\\n/g, '\n'),
  }),
});
const db = getFirestore();

const snap = await db.collection('users').where('role', '==', 'parent').get();
console.log(`학부모 계정 ${snap.size}개`);

let changed = 0;
let already = 0;
for (const d of snap.docs) {
  const v = d.data();
  const want = [...new Set((v.children ?? []).map((c) => c?.classId).filter(Boolean))];
  const have = v.childClassIds ?? [];
  const same = want.length === have.length && want.every((c) => have.includes(c));
  if (same) { already++; continue; }

  changed++;
  console.log(`  ${v.displayName || d.id}: ${JSON.stringify(have)} → ${JSON.stringify(want)}`);
  if (APPLY) await d.ref.set({ childClassIds: want }, { merge: true });
}

console.log(`\n이미 맞음 ${already}개 · ${APPLY ? '고침' : '고칠 것'} ${changed}개`);
if (!APPLY && changed > 0) console.log('실제로 쓰려면 --apply 를 붙이세요.');
