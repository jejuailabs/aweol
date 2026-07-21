import { myClassIds, isTeacherOfClass } from '../src/lib/auth-helpers.ts';
let f=0; const ok=(n,c)=>{console.log((c?'✓':'✗')+' '+n); if(!c)f++;};
const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

ok('아이 — 자기 반',
  eq(myClassIds({role:'student', classIds:['3-1'], children:[]}), ['3-1']));
ok('선생님 — 맡은 반 여러 개',
  eq(myClassIds({role:'teacher', classIds:['3-1','3-2'], children:[]}), ['3-1','3-2']));
ok('학부모 — 자녀 반 (classIds 가 아니라 children 에 있다)',
  eq(myClassIds({role:'parent', classIds:[], children:[{classId:'4-2'}]}), ['4-2']));
ok('학부모 — 자녀 둘',
  eq(myClassIds({role:'parent', classIds:[], children:[{classId:'1-1'},{classId:'5-3'}]}), ['1-1','5-3']));
ok('겹치면 한 번만',
  eq(myClassIds({role:'parent', classIds:['2-2'], children:[{classId:'2-2'}]}), ['2-2']));
ok('총관리자 — 비어 있다 (온 학교가 내 반이면 강조가 의미 없다)',
  eq(myClassIds({role:'super_admin', classIds:[], children:[]}), []));
ok('로그인 안 함 → 빈 배열',
  eq(myClassIds(null), []));
ok('필드가 없어도 안 터진다',
  eq(myClassIds({role:'student'}), []));

console.log('\n--- 남의 반에서 쓰기 ---');
ok('내 반 담임은 된다', isTeacherOfClass('teacher', ['3-1'], '3-1')===true);
ok('남의 반 담임은 안 된다', isTeacherOfClass('teacher', ['3-1'], '3-2')===false);
ok('아이는 담임이 아니다', isTeacherOfClass('student', ['3-1'], '3-1')===false);
ok('총관리자는 다 된다', isTeacherOfClass('super_admin', [], '9-9')===true);
ok('classIds 가 없어도 안 터진다', isTeacherOfClass('teacher', undefined, '3-1')===false);

console.log(`\n실패 ${f}건`); process.exit(f?1:0);
