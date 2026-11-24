# SmilePark (놀이공원 보드게임)

놀이공원을 경영해 가장 높은 만족도(VP)를 얻는 2~5인 경영 보드게임의 기획·규칙·카드 데이터를 관리하는 프로젝트.

## 다음 작업 최우선 과제 (규칙 v1 도입 후 남은 문제, 2026-10-07)
새 세션을 시작하면 사용자가 다른 일을 지시하지 않는 한 **이 목록부터** 처리한다. 해결한 항목은 이 목록에서 지우고 `docs/balance-report.md` "남은 과제"도 같이 갱신한다. 모든 조정은 `docs/design-v1.md` 0절의 오프라인 원칙(카드 인쇄값 그대로, 손계산, 확률·환산 공식 금지)을 지킨다. 수치는 `npx tsx scripts/balance.ts --n 1500`과 `npm run sim`으로 전후를 비교한다.

1. **사용자 확정 받기**: `docs/design-v1.md` 13절의 임시 수치·관객 그룹 28장 구성·특수효과 재해석은 모두 임시값이다. 작업 시작 시 사용자에게 확정 여부를 먼저 묻는다.
2. **점수 규모가 큼**: 한 게임 만족도가 약 150~170점이라 오프라인에서 1/5 토큰으로 세기 불편하다. 두 방법 중 사용자와 정한다. ① 수치 축소(1명당 만족도 1~2 등) ② 점수 트랙(0~100, 2바퀴)이나 10점 토큰 도입.
3. **후반 잔액 과다**: 최종 잔액이 $25~30 남는다(만족도 +5~6). 돈을 쓸 곳이 사실상 입찰뿐이고 AI 입찰이 소극적이다(`AI_PROFILES`의 `bidRate`·`bidMax`). AI 입찰 개선과 경제 조정(입장료 상한, 상점 수익, 후반 지출처)을 검토한다.
4. **연구원 약함**: 고용 판당 0.3명, 고용자 승률 15%(현재 효과: 매 라운드 만족도 +1, `CFG.researchSat`). +2로 올리면 1라운드 선 플레이어 쏠림이 생겼으니 다른 효과도 함께 검토한다.
5. **약한/강한 카드 조정**(3인 거울전 구매자 승률, 기대 33%)
   - 약함: 트램폴린 19% · 레이저 태그 21% · 클라이밍 벽 22% · 유령의 집 22% · 정보 안내 센터 22%
   - 강함: 산악 롤러코스터 48% · 바이킹 45% · 빠른 스낵바 45%
   - 조정 수단: `src/game/data/cards.ts`의 `EFFECTS` 효과 보강. xlsx 원본은 수정하지 않는다.
6. **건설 중심 AI 약함**(성향 혼합 승률 25%): 규칙 문제인지 AI 판단 문제인지 가린다.
7. **사람 플레이테스트**: 입찰 심리전, 배치 고민, 1라운드 정산 시간(목표 1분 이내)을 실제 플레이로 확인한다. 웹 UI 흐름도 함께 확인한다.

## 공모전 검토
- `docs/contest-review.md`: 2027 코리아보드게임즈 공모전 검토(2026-10-14, 마감 2026-12-31). 이번 공모전은 비추천, 다음 공모전 대비 할 일(차별점 정의 등) 체크리스트. 규칙 아님.

## 자료 (`notes/`)
- `놀이공원_v1.xlsx` — 초기 기획(v1): 룰북v2, 시설 카드(50장), 이벤트 카드(20장). 게임명 "Fantasy Park Tycoon", 라운드 단계(경영→이벤트→건설→관람객 입장→수익→평가), 만족도 트랙 승리.
- `놀이공원.pptx` — 개정 룰 슬라이드(최신으로 간주): 관객카드/시설카드/수리·쓰레기 토큰/운영카드, 개인보드(관객·시설·운영), 인력 트랙(엔지니어·마케팅 전문가·환경 미화원·안내 직원·연구원), 턴 진행 건설→홍보→운영→관리, 돈($1/$2/$5)과 VP(1/5).
- 두 자료는 규칙이 다르다(v1 경영포인트 방식 vs pptx 인력/토큰 방식). 충돌 시 pptx를 우선하고, 불명확하면 사용자에게 확인한다. 원본 notes/는 직접 수정하지 말고 필요 시 새 파일/문서로 정리한다.

## 용어
시설 유형: 스릴형/패밀리형/공포형/어드벤처형/교육형/물놀이형/놀이형/상점/부대시설. 관람객: 어린이/성인. 수치: 건설비용·유지비·수익(어린이/성인)·만족도(어린이/성인)·특수효과.

## 플랫폼 방향
- 모바일 환경에 최적화한 게임으로 만든다(터치 입력, 세로 화면 우선, 작은 화면에서의 가독성, 한 손 조작, 카드·토큰 UI는 탭/드래그 기준).
- 최종 목표는 구글 플레이스토어 앱 출시이나, 현재 단계에서는 **웹 브라우저에서 바로 테스트 가능**해야 한다. 모바일 브라우저 및 데스크톱 브라우저의 모바일 뷰포트에서 동작을 확인한다.
- 나중에 앱으로 포장(WebView/Capacitor/TWA 등)하기 쉽도록 웹 기술 기반(반응형, PWA 친화적)으로 구현하고, 플랫폼 종속 코드는 분리한다.
- 게임 로직(규칙·카드 데이터)은 UI와 분리해 두어 웹 테스트와 이후 앱 출시에서 재사용한다.

## 작업 도구 (`.claude/`)
- agents: `game-designer`(규칙·메카닉 설계), `balance-analyst`(카드 수치 밸런스 분석), `rulebook-writer`(룰북 문서화·일관성 검토)
- skills: `/commit-push`, `/balance-check`, `/notes-sync`

## 작업 규칙
1. 모든 작업 후 git commit & push를 반드시 진행한다. **일상 작업은 `dev`(기본 브랜치)에 커밋·푸시한다. `main`(운영 배포)에는 직접 커밋·푸시하지 않고**, 사용자가 요청할 때만 `dev` → `main` PR(`gh pr create --base main --head dev`)로 병합한다. 작업 시작 전 현재 브랜치가 `dev`인지 확인한다. `dev` 푸시는 CI(`.github/workflows/ci.yml`)만 돌고, `main` 병합이 곧 운영 배포다.
2. commit 메시지는 가급적 한국어로 작성한다.
3. 문서·답변·카드 텍스트는 한국어로 작성한다.
4. 카드 수치를 바꾸면 영향(밸런스, 룰북 서술)을 함께 확인한다.

## 개발 (`src/`)
- 스택: TypeScript + Vite + React. `npm run dev`(웹 테스트, 모바일 뷰포트로 확인) / `npm run build` / `npm test` / `npm run sim`(AI 대전 요약). 밸런스 측정 도구는 `scripts/`(simulate·balance·cards-md), 절차와 결과는 `docs/balance-report.md`.
- `src/game/` — UI 무관 순수 게임 로직(`engine.ts`의 `dispatch`/`newGame`, 카드 데이터 `data/`). 시설 원본은 `python tools/gen_facilities.py`로 xlsx에서 생성(`data/facilities.ts`), 카드 인쇄값 변환·특수효과는 `data/cards.ts`, 관객 그룹은 `data/groups.ts`, 운영카드는 `data/events.ts`. 카드 목록 문서는 `npx tsx scripts/cards-md.ts > docs/cards.md`로 재생성.
- `src/ui/` — 모바일 세로 우선 UI. `src/platform/` — 저장/햅틱 등 플랫폼 종속 코드(앱 포장 시 교체).
- 이모지/시스템 이모티콘은 쓰지 않고 `src/ui/Icon.tsx`의 커스텀 SVG 아이콘만 쓴다.
- 이미지 에셋: `public/images/<슬롯키>.webp`에 넣으면 자동 적용(없으면 플레이스홀더). 슬롯 정의는 `src/ui/assets.ts`, 목록/크기는 개발 서버(`npm run dev`)에서 앱 주소 뒤 `#assets`(운영 빌드에서는 비활성).
- 현재 구현 룰은 `docs/design-v1.md`(pptx의 빈 부분을 채운 것, **오프라인 보드게임 기준**: 카드 인쇄값 그대로, 확률·환산 공식 없음, 손계산 가능). v0은 `docs/archive/`. 인원은 사람 0~1 + AI로 전체 2~5인(`CFG.minPlayers`~`maxPlayers`), 한 기기 다인(핫시트) 미지원. 룰 상수(`CFG`)·인쇄값 변환(`PRINT`)을 바꾸면 `npx tsx scripts/balance.ts`로 영향을 확인하고, 카드 원본(xlsx)은 수정하지 않는다.

## 배포 (AWS)
- 다른 게임(Eleven·AstralTab·MagicAcademy)과 같은 EC2(t4g.nano) 1대를 공유한다. SmilePark는 정적 웹앱이라 `main`에 병합되면 `.github/workflows/deploy-aws.yml`이 `npm test` → `npm run build`를 통과했을 때만 `dist`와 `scripts/aws/`(의존성 없는 정적 서버 `serve.mjs`, `deploy-remote.sh`)를 `~/smilepark`에 올리고 `deploy-remote.sh`가 systemd `smilepark`(포트 **8090**)를 재시작·헬스체크한다. 접속은 `http://<Elastic IP>:8090`.
- SSH(22)는 관리자 IP만 열려 있어 워크플로가 러너 IP를 임시로 열었다 닫는다. 저장소 시크릿: AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_REGION / AWS_SECURITY_GROUP_ID / EC2_HOST / EC2_HOST_KEY / EC2_SSH_PRIVATE_KEY (다른 게임 저장소와 같은 값).
- 최초 1회: EC2에서 `scripts/aws/provision.sh` → `scripts/aws/units.sh` 실행, 보안 그룹에 TCP 8090 인바운드 추가.
