/**
 * 일반(general) 역할 검증.
 *
 * 가입을 **학교 관계자 / 일반** 둘로 가르면서 역할이 하나 늘었다.
 * 역할이 늘 때 제일 위험한 것은 **한 곳은 고치고 한 곳은 빠뜨리는 것**이다 —
 * 어떤 화면에서는 학교 밖 사람인데 어떤 화면에서는 학교 사람이 된다.
 *
 * 그래서 여기서 한꺼번에 확인한다.
 *   1. 역할이 타입에 들어 있나
 *   2. **일반이 학교 쪽 권한을 하나도 안 갖나** (제일 중요하다)
 *   3. 일반은 승인을 안 기다리나
 *   4. 일반은 코드 화면으로 안 가나
 *   5. 화면에 이름·색이 빠지지 않았나
 *   6. 아이 판정(isChild)은 여전히 학생만인가
 *
 * 실행: node --experimental-strip-types scripts/verify-general-role.mjs
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

let pass = 0;
const fails = [];
const ok = (label, cond) => {
  if (cond) pass++;
  else fails.push(label);
};

// ── 1. 타입 ────────────────────────────────────────────
const schema = read('src/lib/firestore-schema.ts');
const roleLine = schema.match(/export type UserRole = [^;]+;/)?.[0] ?? '';
ok('UserRole 에 general 이 있다', roleLine.includes("'general'"));
ok('기존 다섯 역할이 그대로다',
  ['super_admin', 'school_admin', 'teacher', 'student', 'parent']
    .every((r) => roleLine.includes(`'${r}'`)));

// ── 2. 권한 — 일반은 학교 쪽을 하나도 못 한다 ──────────
const helpers = read('src/lib/auth-helpers.ts');
/**
 * 함수 본문만 떼어내 'general' 이라는 글자가 있는지 본다.
 * 열거식(`role === 'x' || ...`)이라 글자가 없으면 곧 false 다.
 */
const body = (name) => {
  const i = helpers.indexOf(`export function ${name}(`);
  if (i < 0) return null;
  const start = helpers.indexOf('{', i);
  let depth = 0;
  for (let j = start; j < helpers.length; j++) {
    if (helpers[j] === '{') depth++;
    else if (helpers[j] === '}' && --depth === 0) return helpers.slice(start, j + 1);
  }
  return null;
};

/** 일반이 절대 가지면 안 되는 권한들 */
const FORBIDDEN = [
  'canManageClass',   // 반 관리
  'canCreateClass',   // 반 만들기
  'isStaff',          // 교직원
  'isSchoolManager',  // 학교 관리자
  'canApproveTeacher',// 교사 승인
  'canUploadArtwork', // 학급 작품 올리기
  'canApproveArtwork',// 작품 승인
  'canAccessAdmin',   // 관리 화면
];
for (const fn of FORBIDDEN) {
  const b = body(fn);
  ok(`${fn} 가 있다`, b !== null);
  ok(`일반은 ${fn} 가 아니다`, b !== null && !b.includes("'general'"));
}

// isTeacherOfClass 는 role 을 열거하므로 general 이 없으면 곧 false
const tc = body('isTeacherOfClass');
ok('일반은 담임이 아니다', tc !== null && !tc.includes("'general'"));

// canWriteComment 는 `role !== null` — 일반도 감상평을 쓸 수 있어야 한다
const cw = body('canWriteComment');
ok('일반도 감상평은 쓸 수 있다', cw !== null && cw.includes('!== null'));

// 새 판별 함수
ok('isGeneral 이 general 만 본다',
  (body('isGeneral') ?? '').includes("role === 'general'"));
const sm = body('isSchoolMember');
ok('isSchoolMember 에 general 이 없다', sm !== null && !sm.includes("'general'"));
ok('isSchoolMember 가 학교 다섯을 모두 센다',
  sm !== null && ['super_admin', 'school_admin', 'teacher', 'student', 'parent']
    .every((r) => sm.includes(`'${r}'`)));

// ── 3~4. 가입 서버 ────────────────────────────────────
const roleApi = read('src/app/api/role/route.ts');
const selfServe = roleApi.match(/const SELF_SERVE = new Set\(\[([^\]]*)\]/)?.[1] ?? '';
const needsApproval = roleApi.match(/const NEEDS_APPROVAL = new Set\(\[([^\]]*)\]/)?.[1] ?? '';
const needsCode = roleApi.match(/const NEEDS_CODE = new Set\(\[([^\]]*)\]/)?.[1] ?? '';

ok('일반은 즉시 부여된다', selfServe.includes("'general'"));
ok('일반은 승인 대기가 아니다', !needsApproval.includes("'general'"));
ok('일반은 코드 화면으로 안 간다', !needsCode.includes("'general'"));
ok('학생·학부모는 코드 화면으로 간다',
  needsCode.includes("'student'") && needsCode.includes("'parent'"));
ok('교사·학교관리자는 여전히 승인 대기다',
  needsApproval.includes("'teacher'") && needsApproval.includes("'school_admin'"));
ok('서버가 갈 곳(next)을 정해 준다', /next:\s*NEEDS_CODE\.has\(role\)/.test(roleApi));

// **총관리자는 신청으로 못 얻는다** — 역할이 늘어도 이건 그대로여야 한다
ok('super_admin 은 신청 대상이 아니다',
  !selfServe.includes("'super_admin'") && !needsApproval.includes("'super_admin'"));

// ── 5. 가입 화면 ──────────────────────────────────────
const joinPage = read('src/app/(auth)/join-request/page.tsx');
ok('두 갈래(track) 를 먼저 묻는다', /useState<'school' \| 'general' \| null>\(null\)/.test(joinPage));
ok('일반 갈래를 고르면 역할이 general 로 정해진다',
  /t\.value === 'general' \? 'general' : null/.test(joinPage));
ok('학교 갈래에서만 네 역할이 보인다', joinPage.includes("{track === 'school' && ("));
ok('첫 화면에는 제출 단추가 없다', joinPage.includes('{track !== null && ('));
ok('되돌아갈 길이 있다', joinPage.includes('처음으로 돌아가기'));
ok('서버가 준 next 로 이동한다', joinPage.includes("json.next || '/join-class'"));
ok('학교 네 역할이 그대로 남아 있다',
  ["'teacher'", "'school_admin'", "'student'", "'parent'"]
    .every((r) => joinPage.includes(`value: ${r}`)));

// ── 6. 화면 표시 — 빠지면 색이 undefined 가 되어 배지가 깨진다 ──
const profile = read('src/components/navigation/ProfileMenu.tsx');
ok('ProfileMenu 에 일반 이름이 있다', /general: '일반'/.test(profile));
ok('ProfileMenu 에 일반 색이 있다', /general: '#[0-9A-Fa-f]{6}'/.test(profile));
ok('일반에게 반 코드 입력이 안 보인다',
  profile.includes("(shownRole === 'student' || shownRole === 'parent')"));
ok('일반에게 내 전시관이 보인다', profile.includes("shownRole !== 'student'"));

const switcher = read('src/components/navigation/RoleSwitcher.tsx');
ok('역할 테스트에 일반이 있다', switcher.includes("role: 'general'"));
ok('반 없이도 고를 수 있는 역할에 일반이 있다',
  /NO_CLASS: UserRole\[\] = \[[^\]]*'general'/.test(switcher));
// **선언이 쓰이는 곳보다 먼저여야 한다** (전에 이것 때문에 화면이 통째로 죽었다)
ok('NO_CLASS 가 쓰기 전에 선언된다',
  switcher.indexOf('const NO_CLASS') > 0
  && switcher.indexOf('const NO_CLASS') < switcher.indexOf('!NO_CLASS.includes(viewAs.role)'));

const ctx = read('src/lib/auth-context.tsx');
ok('일반 테스트 모드는 소속을 지운다',
  /activeViewAs\.role === 'general'/.test(ctx)
  && /role: 'general',[\s\S]{0,120}schoolIds: \[\]/.test(ctx));

// ── 7. 규칙 — 아이 판정은 학생만이어야 한다 ────────────
const rules = read('firestore.rules');
const isChild = rules.match(/function isChild\(\)[\s\S]*?\n    \}/)?.[0] ?? '';
ok('isChild 는 학생만 본다',
  isChild.includes("userRole() == 'student'") && !isChild.includes('general'));
ok('개인 전시관은 아이에게 안 보인다', rules.includes('!isChild()'));
ok('전시관 만들기는 여전히 서버만', /match \/halls\/\{hallId\}[\s\S]{0,400}allow create: if false/.test(rules));

// 전시관 개설은 학생만 막는다 → 일반은 열 수 있다
const hallApi = read('src/app/api/hall/route.ts');
ok('전시관 개설은 학생만 막는다', hallApi.includes("user.role === 'student'"));
ok('일반의 전시관 개설을 막지 않는다', !hallApi.includes("user.role === 'general'"));

// ── 결과 ──────────────────────────────────────────────
console.log(`\n통과 ${pass} / ${pass + fails.length}`);
if (fails.length) {
  console.log('\n실패:');
  fails.forEach((f) => console.log(`  ✗ ${f}`));
  process.exit(1);
}
console.log('✅ 일반 역할이 학교 권한을 하나도 갖지 않는다');
