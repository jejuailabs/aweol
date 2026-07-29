/**
 * 찜(picks) 검증.
 *
 * 확인하는 것.
 *   1. 찜은 **나만 본다** — 교직원에게도 열리면 안 된다(취향은 지도 자료가 아니다)
 *   2. 같은 그림은 **언제나 같은 문서** — 아니면 두 번 찜되고 풀 수가 없다
 *   3. 목록은 **질의 한 번** — 원본을 다시 읽지 않는다
 *   4. 학교 밖 사람 메뉴에서 학교 것(갤러리·내 스탠드·상점)이 빠졌나
 *   5. **마을은 남았나** — 이건 학교 밖 사람도 들어갈 수 있어야 한다
 *   6. 접힌 것이 없을 때 '더보기' 가 사라지나 (빈 서랍이 올라오면 안 된다)
 *
 * 실행: node scripts/verify-picks.mjs
 */
import { readFileSync } from 'node:fs';
import { join as pathJoin, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = pathJoin(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(pathJoin(ROOT, p), 'utf8');

let pass = 0;
const fails = [];
const ok = (label, cond) => { if (cond) pass++; else fails.push(label); };

// ── 1. 규칙 ───────────────────────────────────────────
const rules = read('firestore.rules');
const picksBlock = rules.match(/match \/picks\/\{pickId\} \{[\s\S]*?\n      \}/)?.[0] ?? '';
ok('picks 규칙이 있다', picksBlock.length > 0);
ok('찜은 본인만 읽는다',
  /allow read: if isSignedIn\(\) && request\.auth\.uid == uid;/.test(picksBlock));
// **교직원에게 열면 안 된다** — 무엇을 찜했는지는 취향이지 지도 자료가 아니다
ok('교직원도 남의 찜을 못 본다', !picksBlock.includes('isStaff()'));
ok('총관리자도 남의 찜을 못 본다', !picksBlock.includes('isSuper()'));
ok('본인만 담고 뺀다',
  /allow create, update: if isSignedIn\(\) && request\.auth\.uid == uid/.test(picksBlock)
  && /allow delete: if isSignedIn\(\) && request\.auth\.uid == uid;/.test(picksBlock));
// 글자 길이를 안 막으면 한 문서에 수십 KB 를 넣어 저장공간을 채울 수 있다
for (const f of ['title', 'hallTitle', 'showTitle']) {
  ok(`${f} 길이를 막는다`, new RegExp(`${f}\\.size\\(\\) <= 120`).test(picksBlock));
}
ok('imageUrl 길이를 막는다', /imageUrl\.size\(\) <= 500/.test(picksBlock));
// 규칙 상한과 코드 상한이 같아야 한다 — 다르면 화면에서는 통과하고 서버가 거절한다
const picksLib = read('src/lib/picks.ts');
ok('코드 상한(120)이 규칙과 같다', /MAX_PICK_TEXT = 120/.test(picksLib));

// ── 2. 같은 그림은 같은 문서 ───────────────────────────
ok('pickId 가 셋을 이어 붙인다',
  /return `\$\{safe\(hallId\)\}__\$\{safe\(showId\)\}__\$\{safe\(workId\)\}`/.test(picksLib));
ok('pickId 에 무작위가 없다',
  !/Math\.random|Date\.now|addDoc/.test(picksLib));
ok('문서 id 에 / 가 못 들어간다', /replace\(\/\[\/\]\/g, '_'\)/.test(picksLib));
ok('덮어쓰기(setDoc)로 담는다', picksLib.includes('setDoc(ref'));
ok('풀면 지운다', picksLib.includes('deleteDoc(ref)'));

// ── 3. 목록은 질의 한 번 ──────────────────────────────
ok('목록은 내 찜 컬렉션 하나만 읽는다',
  /getDocs\(\s*query\(collection\(db, 'users', uid, 'picks'\), orderBy\('createdAt', 'desc'\)\)\s*\)/.test(picksLib));
// 원본 작품을 다시 읽으면 찜 개수만큼 읽기가 든다 — 그래서 정보를 베껴 둔다
ok('원본 작품을 다시 읽지 않는다', !picksLib.includes("'halls'"));
for (const f of ['imageUrl', 'title', 'hallTitle', 'showTitle']) {
  ok(`${f} 를 찜 문서에 베껴 둔다`, new RegExp(`  ${f}: string;`).test(picksLib));
}
// 누른 즉시 하트가 바뀌어야 한다 — 늦으면 안 눌린 줄 알고 한 번 더 눌러 도로 풀린다
ok('먼저 화면을 바꾸고 나중에 저장한다',
  picksLib.indexOf('setRows((prev) => (was ?') < picksLib.indexOf('await deleteDoc(ref)'));
ok('실패하면 되돌린다', /catch \{[\s\S]{0,200}setRows\(\(prev\) => \(was \?/.test(picksLib));

// ── 4. 찜 단추 ────────────────────────────────────────
const showPage = read('src/app/(main)/hall/[hallId]/show/[showId]/page.tsx');
ok('전시실에 찜 단추가 있다', showPage.includes('picks.toggle({'));
// 로그인해야 담을 수 있다 — 아니면 눌러도 아무 일이 안 일어난다
ok('비로그인에게는 찜 단추를 안 보여준다', /\{uid && \(\s*<button\s+onClick=\{\(\) => picks\.toggle/.test(showPage));
ok('찜 상태에 따라 하트가 바뀐다',
  showPage.includes("picks.has(hallId, showId, open.id) ? '♥ 찜함' : '♡ 찜하기'"));
ok('목록에는 작은 판을 담는다', showPage.includes('open.thumbnailUrl || open.imageUrl'));

// ── 5. 찜 목록 화면 ───────────────────────────────────
const picksPage = read('src/app/(main)/picks/page.tsx');
ok('찜 화면이 전시별로 묶는다', picksPage.includes('`${r.hallId}/${r.showId}`'));
ok('찜 화면에서 전시실로 갈 수 있다', picksPage.includes('showPath(g.hallId, g.showId)'));
ok('찜 화면에서 뺄 수 있다', picksPage.includes('picks.remove(r.id)'));
ok('비로그인에게 이유를 말해준다', picksPage.includes("router.push('/login?from=/picks')"));

// ── 6. 메뉴 ───────────────────────────────────────────
const nav = read('src/components/navigation/BottomNav.tsx');
const generalItems = nav.match(/const generalItems: NavItem\[\] = \[[\s\S]*?\];/)?.[0] ?? '';
ok('학교 밖 메뉴가 따로 있다', generalItems.length > 0);
ok('학교 밖 메뉴에 마을이 있다', generalItems.includes("href: '/village'"));
ok('학교 밖 메뉴에 찜한 그림이 있다', generalItems.includes("href: '/picks'"));
for (const [href, what] of [['/gallery', '갤러리'], ['/my-stand', '내 스탠드'], ['/shop', '상점']]) {
  ok(`학교 밖 메뉴에 ${what} 가 없다`, !generalItems.includes(`href: '${href}'`));
}
ok('일반이면 학교 밖 메뉴를 쓴다', /const general = isGeneral\(role\)/.test(nav)
  && /navItems: NavItem\[\] = general\s*\?\s*generalItems/.test(nav));
// 넷뿐이라 접을 것이 없다 — '더보기' 가 남아 있으면 빈 서랍이 올라온다
ok('접힌 것이 없으면 더보기가 사라진다', nav.includes('{mobileRest.length > 0 && ('));
ok('학교 사람 메뉴는 그대로다',
  nav.includes("{ href: '/gallery', label: '갤러리'")
  && nav.includes("{ href: '/my-stand', label: '내 스탠드'")
  && nav.includes("{ href: '/shop', label: '상점'"));

// 마을은 학교를 안 고른 사람도 들어간다 (기본 학교로 떨어진다)
const village = read('src/app/(main)/village/page.tsx');
ok('마을은 소속이 없어도 열린다', /userDoc\?\.schoolIds\?\.\[0\] \|\| FALLBACK_SCHOOL/.test(village));

// 프로필 메뉴 — 학교 사람에게도 길이 있어야 한다(메뉴에는 없으므로)
const profile = read('src/components/navigation/ProfileMenu.tsx');
ok('프로필에 찜한 그림이 있다', profile.includes("router.push('/picks')"));
ok('아이·일반에게는 프로필의 찜이 안 보인다',
  profile.includes("shownRole !== 'student' && shownRole !== 'general'"));

// ── 결과 ──────────────────────────────────────────────
console.log(`\n통과 ${pass} / ${pass + fails.length}`);
if (fails.length) {
  console.log('\n실패:');
  fails.forEach((f) => console.log(`  ✗ ${f}`));
  process.exit(1);
}
console.log('✅ 찜은 나만 보고, 같은 그림은 한 번만 담긴다');
