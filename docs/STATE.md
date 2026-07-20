# 애월초 학급 전시실 — 작업 상태

> 새 세션에서 이어서 작업할 때 이 문서만 읽으면 된다. 마지막 갱신: 다중 학교 + 지도 전환 완료 시점.

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
   ```
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
역할 테스트 모드(🧪) · 사운드 9종(Web Audio 합성) · 보안 규칙 + 검증 스크립트

## 남은 일 (우선순위)

1. **숙제 교사 화면 재설계** — 코드는 있으나(`components/notice/HomeworkPanel.tsx`)
   제출물만 나열해서 **미제출자가 안 보인다**. 다했니 벤치마킹대로
   **명부 기반 25칸 3색 그리드**(미제출/제출/검사완료)로 바꿔야 한다. 콕 찌르기도 함께.
   - 확정 사항: AI 검수는 거부가 아니라 **보류함**(교사 최종 판단) / **반려 기능은 넣지 않음**
     (오프라인 수업이 섞여 있어 알림 없이 반려하면 안 됨. 코멘트로 갈음)
   - 공개 범위 옵션(아이들과 함께 보기 / 선생님만 보기)은 이미 구현됨
2. **도장(쿠키) 경제** — 숙제 검사 시 교사가 지급 → 상점에서 사용.
   상점에 무료 샘플 몇 개를 넣고, 교사의 도장 도구에 삽입할 수 있게.
   지금 상점은 로직이 없어 하단 메뉴에서 숨겨둔 상태(`BottomNav.tsx`).
3. **퀴즈** (#18) — 객관식·주관식·이미지. 점수 없이 푼 학생 목록만 순차 표시.
4. **틀린그림 찾기** (#19) — 사진 업로드 → sharp 보정 → gpt-image-2 low로 5개 전후 변형 생성 →
   가로/세로 비율에 따라 상하·좌우 배치 자동 → 교사가 정답 좌표 클릭 → 학생 풀이 →
   소요 시간 랭킹 → 댓글 → 모달형 제보 게시판.
5. **유무료 정책** (#11) — 전시 주제 무료 1개 제한, 이후 유료.
   착수 전 결정 필요: 구독 단위(교사/학급/학교), 가격, 결제 수단(국내 PG).
6. **다중접속** (#20) — **Firestore 금지**(25명 40분 수업에 약 $10). RTDB 사용 +
   5Hz·움직일 때만·좌표 압축 3종 최적화하면 약 $0.22/회. 영속 데이터는 Firestore,
   휘발성 위치는 RTDB로 분리.
7. **학습 연계 놀이** (#21) — 술래잡기 등. #20 완료가 전제.
   퀴즈·숙제 보상이 게임 능력으로 이어지게. 좀비고 문법을 참고하되
   '감염·추격' 대신 '술래·보물찾기' 톤으로 순화.

## 알려진 미완성

- 상점: 도장 적립·구매 로직 없음 (메뉴 숨김 상태)
- 조형물 작품: 실제 3D 모델이 아니라 회전하는 다면체
- 3D 학교 외관에 학교별 `assets`(무지개/운동장 등) 아직 미반영
