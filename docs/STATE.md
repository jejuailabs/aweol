# 애월초 학급 전시실 — 작업 상태

> 새 세션에서 이어서 작업할 때 이 문서만 읽으면 된다. 마지막 갱신: 틀린그림 찾기 완료 시점.

## 무엇을 만들고 있나

초등학교 학급 작품을 **3D 가상 공간**에 전시하는 웹앱. 지도에서 학교를 고르면
3D 학교 → 교실 → 전시실로 들어가며, 아바타가 걸어다니며 작품을 관람한다.
비로그인 관람은 완전 자유이고, 로그인은 필요한 사람(교사·학생·학부모)만 한다.

- 배포: https://aweol.vercel.app (main 푸시 → Vercel 자동 배포)
- 저장소: github.com/jejuailabs/aweol (**jejuailabs 계정으로 푸시**. 로컬에 다른 깃허브 계정도 있으니 주의)

## 지켜야 할 규칙 (어기면 터진 적 있음)

1. **`firebase-admin/auth` 를 import 하지 말 것.**
   `jwks-rsa@4 → jose@6`(ESM)가 서버리스에서 `require() of ES Module` 로 터져
   해당 API 전체가 500이 된다. 토큰 검증은 `lib/firebase-admin.ts` 가 jose로 직접 한다.
   Firestore 쪽(`firebase-admin/firestore`)은 안전하다.
2. **`server-only` 을 Route Handler 경로에서 import 하지 말 것.** 같은 이유로 500.
3. **로컬 통과 = 배포 통과가 아니다.** 위 두 문제 모두 로컬 dev에서는 재현되지 않았다.
   서버 API를 건드렸으면 반드시 배포 후 프로덕션에서 검증한다:
   ```
   $env:BASE_URL="https://aweol.vercel.app"; node scripts/verify-student-code.mjs
   $env:BASE_URL="https://aweol.vercel.app"; node scripts/verify-blackboard.mjs
   $env:BASE_URL="https://aweol.vercel.app"; node scripts/verify-homework.mjs
   $env:BASE_URL="https://aweol.vercel.app"; node scripts/verify-shop.mjs
   $env:BASE_URL="https://aweol.vercel.app"; node scripts/verify-role.mjs
   $env:BASE_URL="https://aweol.vercel.app"; node scripts/verify-quiz.mjs
   $env:BASE_URL="https://aweol.vercel.app"; node scripts/verify-school-scope.mjs
   $env:BASE_URL="https://aweol.vercel.app"; node scripts/verify-spot.mjs
   ```
   푸시 직후 바로 돌리면 구버전이 응답한다. 2~3분 기다렸다가 검증한다.
4. **Firestore는 중첩 배열을 저장 못 한다.** 좌표는 `[x,y,x,y,...]` 로 펴서 넣는다.
5. **이미지 생성 모델명은 임의로 바꾸지 말 것.** `gpt-image-2`, quality `low`.
   생성 이미지는 항상 Firebase Storage에 올리고 배포물에 포함하지 않는다.
   - `public/` 은 비어 있어야 한다. 여기 넣은 건 전부 Vercel 배포 용량이 된다.
   - **dataURL(base64)을 Firestore 문서에 저장하지 말 것.** 읽을 때마다 그 용량을 다시 낸다.
     이미지는 Storage에 올리고 문서에는 URL만 넣는다.
   - 이미지를 **교체**하는 경로에서는 옛 파일을 지운다. 안 지우면 바꿀 때마다 쌓인다.
     문서를 지우는 경로에서도 딸린 이미지를 함께 지운다.
   - **Firestore 읽기 횟수도 비용이다.** 문서 단위 과금이라 `getDocs` 한 번이
     그 컬렉션 문서 수만큼의 읽기다. 무료 한도 하루 5만 건.
     - **반 → 활동 → 작품처럼 중첩해서 도는 조회를 만들지 말 것.** 반이 늘면 곱으로 커진다.
       필요한 것만 `collectionGroup` + `where` 로 한 번에 가져온다
       (단, collectionGroup 은 중첩 규칙이 적용되지 않아 `match /{path=**}/...` 를 따로 열어야 한다).
     - 전체 집계가 꼭 필요하지 않으면 **펼칠 때 읽는다**(`/admin/[schoolId]` 의 작품 수).
     - 점검: `node scripts/audit-reads.mjs` — 화면별 읽기 수와 규모별 추정치.
     - 남은 한계: `/admin` 학교 목록은 학교·반·활동을 전부 읽어 50개교면 약 4,850건이다.
       학교가 많아지면 학교 문서에 집계 필드를 두는 쪽으로 바꿔야 한다.
   - 점검: `node scripts/audit-storage.mjs` (사용량·고아 파일·문서 속 base64).
     `--clean` 으로 고아 파일 회수. **`app-assets/schools/` 를 제외한 `app-assets/*` 는
     코드가 주소를 박아 쓰는 파일**(`lib/image-urls.ts`)이라 고아로 잡으면 안 된다.
6. **경로 문자열을 직접 조립하지 말 것.** `lib/paths.ts` 헬퍼를 쓴다.
7. 규칙 변경 후에는 `node scripts/deploy-firebase-rules.mjs` 로 배포한다.
   (Firebase CLI 계정에는 이 프로젝트 권한이 없어 서비스 계정으로 직접 배포하는 스크립트다)

## 현재 구조

```
/                                                  지도 (메인)
/school/[schoolId]                                 3D 학교
/school/[schoolId]/class/[classId]                 학급 정보
/school/[schoolId]/class/[classId]/room            3D 교실 (칠판·알림판·게시판)
/school/[schoolId]/class/[classId]/activity/[id]   3D 전시실
/admin/[schoolId]                                  학교별 관리 대시보드
/admin/[schoolId]/{approval,roster,class/[id]}
/admin/logs                                        접근 기록 (슈퍼관리자 전용)
/join-class                                        학생코드 입력
API: /api/{school,school-image,student-code,blackboard,homework,enhance,
          role,shop,quiz,quiz-explain,spot-game,spot-generate}
```

Firestore: `schools/{schoolId}/classes/{classId}/{students,activities,notices,homeworks,quizzes,spotGames,blackboard}`
- `studentCodes`, `blackboard`, `homeworks/*/submissions`, `quizzes/*` 하위,
  `users/*/{inventory,stampLedger}` 는 **클라이언트 쓰기 금지, 서버 전용**
- `quizzes/*/answerKeys`, `spotGames/*/answerKey` 는 **교직원만 읽기**
  (학생이 읽으면 퀴즈·놀이가 성립하지 않는다)
- users 문서의 `role`·`pendingRole`·`classIds`·`stamps`·`avatarCustom` 은 클라이언트 쓰기 금지
- `accessLogs` 는 슈퍼관리자만 읽기

## 완료된 것

지도 메인(OSM 타일 직접 렌더, 마커, 입장 연출) · 다중 학교 구조 · 학교 생성(슈퍼관리자) ·
3D 학교/교실/전시실 · 아바타 16종(옷·머리 색 선택) + 걷기/충돌 · 카메라 360°+피치+핀치줌 ·
작품 전시/상세/좋아요/댓글 · 작품 업로드(교사 일괄 + AI 사진 보정) ·
칠판 낙서(손글씨·텍스트·지우개, 작성자·IP 기록) · 알림판(알림장·급식) ·
학생코드(명부↔계정 연결, 학부모 자녀 연결까지) · 관리자/교사 대시보드 ·
역할 테스트 모드(🧪) · 사운드 9종(Web Audio 합성) · 보안 규칙 + 검증 스크립트 ·
**숙제 교사 현황판**(명부 기반 3색 그리드 · 콕 찌르기 · 검사완료) ·
**도장 경제**(검사 → 지급 → 상점 구매 → 3D 아바타 반영) ·
**교사 승인제**(슈퍼관리자 컨펌) · **퀴즈**(객관식·단답형·서술형 + 이미지·유튜브 + AI 해설) ·
**틀린그림 찾기**(AI 변형 + 교사가 정답 찍기 + 서버 판정 + 순위표)

### 숙제 화면 구조 (2026-07-20 재설계)

교사 화면의 기준은 제출물이 아니라 **명부**다. `HomeworkTeacherGrid.tsx` 가
`students` 를 깔고 `submissions`/`nudges` 를 얹어 색을 칠한다.

- 3색: 미제출(베이지) / 제출(파랑) / 검사완료(초록). 학생코드 **미연결자는 점선 칸**으로
  따로 뺀다 — 제출 자체가 불가능한 상태라 미제출과 섞으면 헛되이 찌르게 된다.
- `checked` 는 재제출 시 초기화된다. 옛 내용을 보고 검사한 셈이 되면 안 된다.
- 콕 찌르기: `homeworks/*/nudges/{uid}`. 서버만 쓰고 읽기는 **찔린 본인과 교직원만**
  (친구가 누가 안 냈는지 훑어볼 수 없어야 한다). 제출하면 자동 해제.
- **반려 기능은 넣지 않기로 확정.** 오프라인 수업이 섞여 있어 알림 없이 반려하면
  아이가 영문을 모른다. AI 검수도 거부가 아니라 보류(교사 최종 판단), 코멘트로 갈음.
- 도장 지급은 이 화면의 **검사완료 버튼**에 붙어 있다 (아래 도장 경제 참고).

### 도장(쿠키) 경제 (2026-07-20)

버는 곳(숙제) → 쓰는 곳(상점) → 보이는 곳(3D 아바타)이 한 줄로 이어져 있다.

- **교사가 도장을 찍는 행위 = 검사완료 = 아이에게 도장 1개**. 셋을 하나로 묶어 손이 한 번만 간다.
  도안(참 잘했어요·고마워요·감사해요·최고예요)은 상점의 `stamp` 카테고리에서 챙기고,
  **보유한 것만** 찍을 수 있다. 지금은 전부 무료.
- **경제 관련 쓰기는 전부 서버(`/api/shop`, `/api/homework`)에만 있다.**
  규칙이 users 문서의 `stamps`·`avatarCustom` 변경을 막는다 — 열려 있으면
  자기 문서에 `stamps: 9999` 를 써넣고 상점을 털 수 있다.
  가격도 요청 본문이 아니라 `lib/shop-catalog.ts` 에서 읽는다. 안 그러면 0원에 사간다.
- 규칙에서 `get(키, 기본값)` 을 쓴 이유: 이 기능 이전 계정에는 `stamps` 필드가 없고,
  없는 필드를 그냥 참조하면 **규칙 평가가 실패해 아바타 선택·설정 저장까지 막힌다.**
- **도장 파밍 구멍 두 개**를 막아뒀다. 건드릴 때 주의:
  (1) 재검사 중복 지급 → `submission.awarded` 플래그.
  (2) 제출→검사→재제출→재검사 → 재제출이 문서를 통째로 덮어쓰며 `awarded` 를 흘리던 것을
  이어받게 했다. **submissions doc 은 set(merge)가 아니라 통째 덮어쓰기라 필드 추가 시 조심.**
- 검사를 취소해도 이미 준 도장은 회수하지 않는다. 받았다 뺏기면 아이가 상처받는다.
- 아이템은 `walker.tsx` 가 실제로 그릴 수 있는 것만 판다. 살 수는 있는데 껴도 안 보이면
  아이 입장에서는 도장을 버린 셈이 된다. 새 품목을 넣으려면 3D 파츠를 먼저 만든다.
- 유저 문서는 `auth-context` 에서 `onSnapshot` 으로 구독한다. 한 번만 읽으면
  받은 도장과 착용한 아이템이 새로고침 전까지 안 보인다.

### 역할과 승인 (2026-07-20)

- **role 은 서버(`/api/role`)만 정한다.** 규칙에서 `role`·`pendingRole`·`classIds` 의
  클라이언트 쓰기를 막았다. update 뿐 아니라 **create 도 막아야 한다** —
  첫 로그인에 `role: 'teacher'` 로 문서를 만들어버리면 그만이기 때문이다.
- 학생·학부모는 종전대로 즉시 부여(어차피 학생코드가 없으면 반에 못 들어간다).
  **교사만 `pendingRole` 로 접수되고 슈퍼관리자가 `/admin/teachers` 에서 승인**해야 role 이 된다.
- **교사 권한은 소속 학교 안에서만 통한다.** 신청할 때 학교를 고르고(`pendingSchoolId`),
  승인되면 `schoolIds` 에 그 학교만 들어간다. 규칙은 `isStaffOf(schoolId)` 로 판정하고
  API 는 `isStaffOfSchool(user, schoolId)` 을 쓴다. 전역 `isStaff()` 는 학교를 특정할 수 없는
  자리(collectionGroup)에서만 쓴다.
- `users` 문서 읽기는 본인과 총관리자만이다. 교사에게 열면 남의 학교 아이·학부모까지 보인다.
- `super_admin` 은 신청 대상이 아니다. Firestore 콘솔에서 직접 지정한다.

### 학교별 3D 외관 (2026-07-20)

건물 형태는 학교 공용이고, **이름·현판·색**만 학교별로 바뀐다.

- 간판 문구는 반드시 학교 문서의 `name` 에서 온다. 예전엔 '애월초등학교' 가 박혀 있어
  한라산에 들어가도 애월초로 보였다.
- `lib/image-palette.ts` 가 대표 이미지에서 벽·지붕 색을 뽑는다. 못 뽑으면 기본 색.
  **색 추출에는 버킷 CORS 가 필요하다** (canvas 가 오염되면 getImageData 가 던진다).
- 대표 이미지는 업로드 시점에 가로 1024 / JPEG 로 줄인다(`lib/image-compress.ts`).
  3D 학교 화면을 열 때마다 내려받는 파일이라 원본 PNG(1MB+)를 그대로 두면 egress 가 샌다.

### 퀴즈 (2026-07-20)

유형 3종(객관식·단답형·서술형) + 자료 2종(이미지·유튜브) + AI 해설.

- **정답은 절대 클라이언트로 내려가지 않는다.** 문항(`questions`)과 정답(`answerKeys`)을
  다른 컬렉션에 나누고 `answerKeys` 는 교직원만 읽게 막았다. 문항 문서에 정답을 같이 넣으면
  개발자도구로 그냥 보인다. **채점도 서버에서 한다** — 클라이언트 채점은 결국 정답을 받아야 한다.
- 단답형은 공백·문장부호·전각을 정규화해 채점한다(`lib/quiz-utils.ts`).
  "3 개", "3개.", "３개" 를 다르게 보면 아는 아이가 틀린 것으로 나온다.
  허용 표기를 쉼표로 여러 개 받는다.
- **서술형은 채점하지 않는다.** 초등학생 글을 기계가 맞다/틀리다 하면 안 된다. 교사가 읽는다.
- AI 해설(`/api/quiz-explain`)은 **제출한 사람만** 부를 수 있다.
  안 그러면 풀기 전에 해설을 열어 정답을 알아낸다.
  한 번 만들면 문항에 캐시해 반 전체가 재사용한다 — 25명이 각자 부르면 같은 답을 25번 산다.
  교사가 직접 쓴 해설이 언제나 우선. 모델은 `OPENAI_TEXT_MODEL`(기본 gpt-4o-mini).
- 출제는 전부 검사한 뒤 배치 저장. 하나라도 잘못되면 통째로 거부해 반쪽 퀴즈를 남기지 않는다.
- 유튜브는 전체 URL이 아니라 **id 만** 저장한다(공유·짧은 링크·임베드·Shorts·live 모두 파싱).
- 점수는 아이에게 보여주지 않는다. 문항별 ⭕❌ 와 해설만 준다.

### 틀린그림 찾기 (2026-07-20)

알림판 다섯 번째 칸. 사진 하나로 만들고, 아이는 다른 곳을 찾아 누른다.

- **AI가 정확히 몇 군데를 바꿔줄지는 알 수 없다.** 그래서 `/api/spot-generate` 결과를
  정답으로 삼지 않는다. 선생님이 두 그림을 보고 **직접 찍은 좌표만** 정답이다.
- 정답 좌표는 `spotGames/*/answerKey` 에 따로 두고 교직원만 읽는다.
  찍을 때마다 서버가 판정하고 맞은 자리만 돌려준다 — 좌표를 내려주면 1초 만에 끝난다.
- **시간은 서버가 잰다.** 클라이언트가 보내는 초를 믿으면 순위표가 의미 없다.
  끝낸 뒤에는 다시 시작할 수 없다(기록 갈아치우기 차단).
- 찾을 개수(`spotCount`)는 공개한다. 몇 개 남았는지는 알아야 한다. 좌표만 숨긴다.
- 세로로 긴 사진은 좌우로, 아니면 위아래로 배치한다(`layout`).
  두 그림은 같은 크기·방향으로 맞춰 저장한다 — 안 그러면 좌표가 어긋난다.
- 아직 없는 것: 제보 게시판, 댓글.

### 이미지 로딩 (2026-07-20)

- 작품은 업로드할 때 **썸네일(640px)을 따로 만들어** 함께 올린다(`lib/client-image.ts`).
  전시실 액자는 썸네일, 원본은 눌러서 상세를 볼 때만 받는다.
  이걸 안 하면 액자 12개짜리 방 하나가 22MB다(실측). 지금은 1.1MB.
- 옛 작품은 `node scripts/backfill-thumbnails.mjs --apply` 로 따라잡는다(여러 번 돌려도 안전).
- **Storage 주소 파싱은 `lib/storage-path.ts` 를 쓴다.** 직접 정규식을 쓰지 말 것 —
  `firebasestorage.googleapis.com` 이 `storage.googleapis.com` 을 문자열로 포함해서,
  순서를 잘못 잡으면 엉뚱한 경로가 나온다. 실제로 이 버그로 점검 스크립트가
  멀쩡한 파일을 고아로 잡을 뻔했다.

### 아바타 (2026-07-20)

프리셋 16종 + 옷·머리 색 고르기. 한 반 25명이 8종을 나눠 쓰면 계속 겹친다.

- 색(`avatarTint`)은 **본인이 직접 쓴다.** 상점 아이템(`avatarCustom`)과 달리
  대가를 치르고 얻는 게 아니라 취향 문제라, 서버를 거칠 이유가 없다.
  대신 규칙에서 `avatarCustom` 은 계속 서버 전용으로 막아둔다.
- 프리셋 목록이 **두 벌 있다**: 3D 실물은 `walker.tsx` 의 `AVATAR_LOOKS`,
  선택 화면 미리보기는 `lib/avatar-presets.ts`. 나누는 이유는 walker 가 three 를
  끌고 들어와서, 로그인 직후의 2D 선택 화면이 그걸 import 하면 three 전체가
  그 번들에 딸려오기 때문이다. **한쪽 색을 고치면 다른 쪽도 고쳐야 한다.**
- 색 목록(`SHIRT_COLORS`/`HAIR_COLORS`)만은 `lib/avatar-presets` 한 곳에 두고
  walker 가 다시 내보낸다.

## 남은 일 (우선순위)

1. **유무료 정책** (#11) — 전시 주제 무료 1개 제한, 이후 유료.
   착수 전 결정 필요: 구독 단위(교사/학급/학교), 가격, 결제 수단(국내 PG).
2. **다중접속** (#20) — **Firestore 금지**(25명 40분 수업에 약 $10). RTDB 사용 +
   5Hz·움직일 때만·좌표 압축 3종 최적화하면 약 $0.22/회. 영속 데이터는 Firestore,
   휘발성 위치는 RTDB로 분리.
3. **학습 연계 놀이** (#21) — 술래잡기 등. #20(다중접속) 완료가 전제.
   퀴즈·숙제 보상이 게임 능력으로 이어지게. 좀비고 문법을 참고하되
   '감염·추격' 대신 '술래·보물찾기' 톤으로 순화.

## 알려진 미완성

- 상점: 아이템이 8종뿐이고, 도장을 쓸 곳이 아바타 꾸미기 하나다
- 조형물 작품: 실제 3D 모델이 아니라 회전하는 다면체
- 3D 학교 외관: 이름·현판·색은 학교별로 반영됐지만 `assets`(무지개/운동장 등)는 아직 미반영
- 틀린그림 찾기: 제보 게시판·댓글 미구현
- `/admin` 학교 목록의 읽기 수 (위 규칙 5 참고)
- **3D 화면은 눈으로 확인하지 못했다.** 프리뷰 브라우저에서 requestAnimationFrame 이
  동작하지 않아 R3F 씬이 아예 마운트되지 않는다(앱 버그 아님, 환경 제약).
  상점 아이템 착용 모습, 알림판 가림 처리, 전시실 2줄 배치·나가는 문,
  학교별 외관, 알림판 5칸 배치는 **배포본에서 사람이 봐야 한다.**
