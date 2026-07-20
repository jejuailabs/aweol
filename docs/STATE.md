# 애월초 학급 전시실 — 작업 상태

> 새 세션에서 이어서 작업할 때 이 문서만 읽으면 된다. 마지막 갱신: 도장 경제 완료 시점.

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
   ```
   푸시 직후 바로 돌리면 구버전이 응답한다. 2~3분 기다렸다가 검증한다.
4. **Firestore는 중첩 배열을 저장 못 한다.** 좌표는 `[x,y,x,y,...]` 로 펴서 넣는다.
5. **이미지 생성 모델명은 임의로 바꾸지 말 것.** `gpt-image-2`, quality `low`.
   생성 이미지는 항상 Firebase Storage에 올리고 배포물에 포함하지 않는다.
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
API: /api/{school,school-image,student-code,blackboard,homework,enhance}
```

Firestore: `schools/{schoolId}/classes/{classId}/{students,activities,notices,homeworks,blackboard}`
- `studentCodes`, `blackboard`, `homeworks/*/submissions` 는 **클라이언트 쓰기 금지, 서버 전용**
- `accessLogs` 는 슈퍼관리자만 읽기

## 완료된 것

지도 메인(OSM 타일 직접 렌더, 마커, 입장 연출) · 다중 학교 구조 · 학교 생성(슈퍼관리자) ·
3D 학교/교실/전시실 · 아바타 8종 + 걷기/충돌 · 카메라 360°+피치+핀치줌 ·
작품 전시/상세/좋아요/댓글 · 작품 업로드(교사 일괄 + AI 사진 보정) ·
칠판 낙서(손글씨·텍스트·지우개, 작성자·IP 기록) · 알림판(알림장·급식) ·
학생코드(명부↔계정 연결, 학부모 자녀 연결까지) · 관리자/교사 대시보드 ·
역할 테스트 모드(🧪) · 사운드 9종(Web Audio 합성) · 보안 규칙 + 검증 스크립트 ·
**숙제 교사 현황판**(명부 기반 3색 그리드 · 콕 찌르기 · 검사완료) ·
**도장 경제**(검사 → 지급 → 상점 구매 → 3D 아바타 반영)

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

## 남은 일 (우선순위)

0. **교사 역할 자기지정 구멍 (보안, 착수 전 우선 처리 권장)** —
   `(auth)/join-request/page.tsx` 에서 가입자가 스스로 `role: 'teacher'` 를 써넣을 수 있고
   승인 절차가 없다. 교직원이 되면 명부(아이들 이름·학생코드)·전 제출물 열람,
   학교 데이터 수정, **도장 무한 발행**이 전부 열린다. 규칙에서 `role` 클라이언트 쓰기를 막고
   승인 게이트(`pendingRole`)를 두어야 한다.
1. **퀴즈** (#18) — 객관식·주관식·이미지. 점수 없이 푼 학생 목록만 순차 표시.
2. **틀린그림 찾기** (#19) — 사진 업로드 → sharp 보정 → gpt-image-2 low로 5개 전후 변형 생성 →
   가로/세로 비율에 따라 상하·좌우 배치 자동 → 교사가 정답 좌표 클릭 → 학생 풀이 →
   소요 시간 랭킹 → 댓글 → 모달형 제보 게시판.
3. **유무료 정책** (#11) — 전시 주제 무료 1개 제한, 이후 유료.
   착수 전 결정 필요: 구독 단위(교사/학급/학교), 가격, 결제 수단(국내 PG).
4. **다중접속** (#20) — **Firestore 금지**(25명 40분 수업에 약 $10). RTDB 사용 +
   5Hz·움직일 때만·좌표 압축 3종 최적화하면 약 $0.22/회. 영속 데이터는 Firestore,
   휘발성 위치는 RTDB로 분리.
5. **학습 연계 놀이** (#21) — 술래잡기 등. #20(다중접속) 완료가 전제.
   퀴즈·숙제 보상이 게임 능력으로 이어지게. 좀비고 문법을 참고하되
   '감염·추격' 대신 '술래·보물찾기' 톤으로 순화.

## 알려진 미완성

- 상점: 아이템이 8종뿐이고, 도장을 쓸 곳이 아바타 꾸미기 하나다
- 조형물 작품: 실제 3D 모델이 아니라 회전하는 다면체
- 3D 학교 외관에 학교별 `assets`(무지개/운동장 등) 아직 미반영
