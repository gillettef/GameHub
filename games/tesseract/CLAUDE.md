# 테서랙트 (TESSERACT) — 온라인 버전

주사위 퍼즐 보드게임 「테서랙트」를 오프라인 제작 전에 **모바일 최적화 웹 게임**으로 먼저 구현하는 프로젝트입니다.

## 필수 작업 규칙

- **단계별 작업이 끝나면 반드시 git commit & push를 진행한다.** (`/commit-push` 스킬 사용)
  - 원격: `origin` = https://github.com/gillettef/GameHub.git 의 `games/tesseract/` (모노레포, 옛 개별 저장소 `gillettef/Tesseract` 는 2026-11-25 삭제), 기본 브랜치 `dev`
  - **일상 작업은 `dev`(기본 브랜치)에 커밋·푸시한다. `main`(운영 배포)에는 직접 커밋·푸시하지 않고**, 사용자가 요청할 때만 `dev` → `main` PR(`gh pr create --base main --head dev`)로 병합한다. 작업 시작 전 현재 브랜치가 `dev`인지 확인한다. `dev` 푸시는 CI(GameHub `.github/workflows/ci-workspace.yml`)만 돌고, `main` 병합이 곧 운영 배포다.
  - 테스트·타입 체크가 실패한 상태로는 커밋하지 않는다. 실패하면 고치거나, 사용자에게 알리고 지시를 받는다.
- **commit 메시지는 가급적 한국어로 작성한다.** 형식은 `/commit-push` 스킬 참고.
- 사용자와의 대화, 문서, 코드 주석도 한국어를 기본으로 한다. 식별자(변수·함수·파일명)는 영어.

## 규칙의 단일 출처

- 게임 규칙은 **`docs/rule.md`**(현재 v0.8)가 유일한 기준이다.
- 규칙이 모호하거나 빠진 부분은 **추측해서 구현하지 않는다.** 사용자에게 묻고, 결정된 내용은 사용자 동의를 받아 `docs/rule.md`에 반영한다.
- 구현 중 규칙 자체의 문제(밸런스, 모순)를 발견하면 코드로 몰래 고치지 말고 사용자에게 보고한다.
- 규칙을 구현하거나 바꿀 때는 `/implement-rule` 스킬 절차를 따른다.

## 기술 스택 (기본값, 변경 시 이 문서도 갱신)

| 영역 | 선택 |
|---|---|
| 언어 | TypeScript 6 (strict, `noUncheckedIndexedAccess`) |
| 클라이언트 | React 19 + Vite 8, iPhone 17 Pro 세로 기준(GameHub `docs/refactor-plan.md` 4·5절), PWA 매니페스트 |
| 스타일 | Tailwind CSS v4. 공통 테마(`@gamehub/ui/theme.css`) 위에 이 게임의 색·글꼴·애니메이션 토큰을 `src/app/global.css`의 `@theme` 한곳에 둔다(공통 화면용 `--gh-*` 도 같은 값) |
| 규칙 엔진 | 프레임워크 의존 없는 순수 TS (`src/engine/`). ESLint가 엔진 안의 React import, `Math.random`, `Date.now`, `window`/`document`를 에러로 막음 |
| 테스트 | Vitest 5 (`src/**/*.test.ts(x)`) |
| 린트 | GameHub 루트 ESLint(`packages/config/eslint.js`, 엔진 순수성 규칙 포함) |
| 멀티플레이 | 공통 `@gamehub/net`: 한 기기(`LocalGame`, 돌려 쓰기 + 봇) + 온라인(`createRoomApp`, WebSocket `/ws`). 연결은 `src/def.ts`(GameDef) |
| 배포 | GameHub 허브 안 실행(inproc), 공통 배포 워크플로 (아래 「배포 (AWS)」) |

## 아키텍처 원칙

- **엔진은 순수 함수 리듀서**: `applyAction(state, action) => state`. React, DOM, 네트워크, `Math.random`, `Date`를 엔진에서 쓰지 않는다.
- **난수는 시드 기반 RNG**를 상태에 포함해 결정적으로 만든다. 같은 시드 + 같은 행동 기록 = 같은 게임. (테스트·리플레이·온라인 동기화용)
  - 2026-11-25 공통 방 코드로 옮기며 서버가 좌석마다 가린 상태를 보낸다(`src/def.ts` 의 `redact`): 난수 상태·시드, 목표·사건 덱의 순서(정렬해서 보냄), 남의 개인 목표·제안 카드. 게임이 끝나면 리플레이·통계를 위해 설정과 행동 기록 전체(`view.record`)를 보낸다
  - 화면은 가린 상태로도 엔진 함수(합법 행동, 점수, 한 수 앞 미리 보기)를 그대로 쓸 수 있어야 한다. 가린 필드(난수·덱 순서)에 기대는 미리 보기는 맞지 않을 수 있다
- **상태는 직렬화 가능한 JSON**으로 유지한다. 클래스 인스턴스, 함수, Map/Set을 상태에 넣지 않는다.
- 합법 행동 판정(`getLegalActions`)과 행동 적용은 엔진에만 둔다. UI는 엔진이 허용한 행동만 보여 준다.
- 주사위 방향은 `윗면 + 앞면`으로 표현하고, 회전·면 계산은 `src/engine/dice.ts` 한곳에서만 한다.
  - 전용 주사위: 면 1~5 + ⧗. **면 배치는 주사위마다 다름**(회전 동치 30종 × 4개 = 120개, v0.8 `layoutClasses`). 주사위별 배치를 상태에 담는다
  - **면마다 색이 다름**(v0.7): 숫자 면 1~5에 5색이 하나씩(짝은 주사위마다 무작위, `Die.colors`), ⧗ 면은 무색. **주사위의 색 = 윗면의 색**이라 상태에 색을 따로 두지 않고 `dieColor`/`faceColor`(dice.ts)로 계산한다
- 카드(우주 법칙, 목표, 개인 목표, 사건)는 **데이터 + 판정 함수** 형태로 정의해 하나씩 추가할 수 있게 한다. 사건 카드는 `src/engine/events.ts`(시작 사건 = 넘기기 규칙 `tipRules`, 끝 사건 = `resolveEndEvent`).
- 4라운드(v0.8): 준비 때 사건 2장 공개 → ⧗ 주사위·자유 넘기기(`time.free`, 행동 `pass`) → 끝 사건 → 4라운드 목표(모두 3점) → 4차원 점수(꼭대기 지도 `scoreTops`) 순서로 `finishRound4`에서 정산

## 디렉터리 구조

```
docs/            규칙서와 설계 문서
src/engine/      규칙 엔진 (순수 TS) + __tests__/
src/bot/         휴리스틱 봇 (서버·한 기기 공용)
src/def.ts       공통 방·진행 코드에 엔진을 잇는 GameDef(행동 검사, 좌석별로 가린 상태, 봇)
src/ui/          React 컴포넌트, 화면
src/app/         화면 전환(App), 기록·리플레이·이어 하기 저장(session)
server/app.ts    온라인 서버(createRoomApp(def))
scripts/aws/     허브 안 실행 진입점(hub-entry.mjs)
test/            GameDef 테스트,  e2e/  iPhone 화면 확인
public/          아이콘, 매니페스트
```

## 모바일 UI 원칙

- 기준 화면 iPhone 17 Pro 402×874(세로). 가로 스크롤·페이지 스크롤 금지(화면마다 본문 안에서 스크롤, `primitives.tsx` 의 `Screen`), 좌우 여백 최소 16px.
- 대국 화면은 공통 배치 `GameShell`: ① 차례·라운드 ② 플레이어(누르면 그 보드) ③ 안내·목표·보드·손·시장 ⑤ 두 번 눌러 확정하는 행동의 확정·취소 또는 되돌리기. ≡ 메뉴에 카드·규칙·기록·나가기.
- 터치 대상은 최소 44×44px. 호버에 의존하는 정보 금지 (탭·롱프레스로 대체).
- 개인 보드(5×3 + 기둥 높이)는 한 화면에 들어와야 한다. 기둥 내부 주사위는 탭해서 펼쳐 본다.
- 주사위 윗면·앞면·색은 색맹도 구분 가능하게 **색 + 모양/라벨**을 함께 쓴다.
- 조작 반응 애니메이션은 짧게(≤300ms). 차례 배너·스스로 버린 잔해 팝업 같은 가벼운 연출은 들어오고 나가는 구간만 ≤300ms로 하고 터치를 막지 않는다(`pointer-events: none`). `prefers-reduced-motion`이면 모두 끈다.
- **플레이어가 확인해야 할 사건**(라운드 시작, 라운드 목표 달성, 라운드별 기본 점수 확정, 4라운드 끝 사건 발동, 이 기기 사람이 강제로 얻은 잔해)은 **확인 모달**(`src/ui/NoticeModal.tsx`)로 보여 주고 「확인」을 눌러야 넘어간다. 한 행동으로 생긴 알림은 한 장에 모은다. 모달이 떠 있는 동안 봇은 기다리고, 게임 끝 알림을 다 확인해야 결과 화면으로 간다. 봇·원격 플레이어의 잔해와 스스로 버린 잔해는 짧은 팝업. 묶는 규칙은 `src/ui/notices.ts`의 `buildNotices`.
- **되돌리기**: 로컬 게임에서 이 기기 사람의 마지막 수(시장 가져오기·놓기·버리기, 4라운드 넘기기·잔해)를 다음 사람이 두기 전까지 되돌린다. 주사위를 굴려 나온 결과(시장 채우기, 다시 굴리기)가 낀 뒤, 라운드가 바뀐 뒤, 온라인 게임은 되돌리지 않는다. 4라운드는 굴리기가 아니라 넘기기라 되돌릴 수 있다 (사용자 결정 2026-10-23, `canUndo` in `src/app/session.ts`. 공통 진행 코드에서는 저장한 행동 기록에서 마지막 수를 빼고 다시 만든다 — `App.tsx` 의 `LocalTable`). 실수 방지는 기본적으로 두 번 눌러 확정
- 선택지가 하나뿐인 상황(바퀴 마지막 사람의 남은 묶음, 넘길 ⧗이 하나뿐)은 강조하거나 미리 골라 두고, 놓을 칸이 없는 주사위는 고르기 전에 표시한다.
- 사건(라운드 전환, 목표 달성, 잔해 등)은 마지막으로 본 상태와 비교해 `src/ui/fx.ts`의 `diffEvents`에서 찾는다. 엔진에 연출용 상태를 넣지 않는다.

## 비주얼 디자인 (Claude Design 캔버스)

- 카드, 보드, 주사위, 화면 등 디자인과 이미지는 **Claude Design 캔버스**에서 만든다: https://claude.ai/artifact/WYyxf5zZtrTtLVx6DcxHY9
  - 보드: 비주얼 시스템(색·면·전개도·글꼴), 모바일 3라운드 화면, 개인 차원 보드, 카드 템플릿
  - 새 디자인이나 수정은 이 캔버스에 보드를 추가·수정하는 방식으로 한다. 새 캔버스를 만들지 않는다.
- 코드의 색·글꼴은 캔버스와 맞춘다:
  - 바탕 `#14121f`, 면 `#1f1c30`, 선 `#34304d`, 본문 `#ece9ff`, 보조 `#a49fc4`, 포인트 `#9b8cff`
  - 주사위 면 색(기호): 빨강 `#E5484D`(▲), 파랑 `#3B7BF6`(●), 초록 `#34C483`(■), 노랑 `#F5C842`(★), 검정 `#2B2838`(◆, 테두리 `#6d6890`), ⧗ 면은 무색 진주빛 `#cfcbe3`(기호 없음). v0.7부터 색은 주사위가 아니라 면마다 칠함 — 캔버스의 주사위 디자인도 갱신 필요
  - 카드 머리띠: 우주 법칙 `#9b8cff`, 라운드 목표 `#5ad1e6`, 개인 목표 `#f2a65a`, 사건 `#ff8a7a`
  - 카드 v2 (캔버스 「카드 v2」 보드, 사건 카드 포함): 각진 SF 프레임(왼위·오른아래 모서리 자름), 종류 띠·태그, 성운 일러스트 창, 육각 점수 배지. 크기 셋 — 축소(mini, 라운드 시작 알림), 기본(normal, 카드 시트·개인 목표 고르기), 확대(large, 누르면 `CardZoom`)
  - 카드 일러스트는 카드 조건을 주사위 도해로 그린 데이터(`src/ui/cardArtData.ts`). 앱(`CardArt.tsx`)과 캔버스가 같은 데이터를 쓰며, 카드를 추가하면 그림도 추가하고 `npx tsx scripts/gen-cards-board.ts <출력>`으로 캔버스 보드를 다시 만든다
  - 글꼴: 제목·숫자 Space Grotesk, 본문 Noto Sans KR. ⧗은 모래시계 선 아이콘(텍스트 문자 대신)
- 캔버스에서 디자인이 바뀌면 이 목록도 갱신한다.

## 개발 단계 (로드맵)

1. ~~프로젝트 초기화 (Vite + React + TS + Vitest, 린트)~~ ✅
2. ~~엔진: 주사위 모델·RNG·상태 타입~~ ✅
3. ~~엔진: 1~3라운드 (시장, 배치, 쌓기, 기본 점수)~~ ✅
4. ~~엔진: 4라운드 (시간 세기, 돌리기, 인과 역류) + 최종 점수~~ ✅ (v0.5 기준)
   - ~~4b. 엔진: v0.6 반영 — 주사위별 면 배치, ⧗ 위 쌓기 금지, 4라운드 ⧗ 넘기기~~ ✅
5. ~~엔진: 카드 (우주 법칙, 라운드 목표 1~3, 개인 목표)~~ ✅
   - 5b. ~~v0.8: 4차원 점수(꼭대기 지도), 4라운드 목표, 사건 카드, 자유 넘기기, 거울·영원의 우주~~ ✅ (타인의 과거 개입 고급 규칙은 미구현)
6. UI: 로컬 핫시트 플레이 (모바일)
7. 봇 (간단한 휴리스틱)
8. 온라인 멀티플레이
9. 플레이테스트 지원 (리플레이, 통계 → 규칙 밸런스 피드백)

각 단계가 끝날 때마다 commit & push 한다.

## 명령어

GameHub 루트에서 `npm install` 한 뒤 이 폴더에서:

```
npm run dev        # 개발 서버 (화면 + 온라인 서버 /ws 함께)
npm test           # Vitest
npm run typecheck  # tsc --noEmit
npm run build      # vite build + 서버 번들(server-dist/app.cjs)
npm run e2e        # 빌드 결과를 허브(/tesseract/)로 띄워 iPhone 화면 확인
npm start          # 빌드 결과를 허브와 같은 방식으로 실행
```

린트는 루트에서 `npm run lint`.

## 배포 (AWS)

- 운영은 GameHub 허브 안에서 실행된다(`hub/games.json` `"mode": "inproc"`, 진입점 `scripts/aws/hub-entry.mjs` → `server-dist/app.cjs`). 접속은 `http://54.116.67.196/tesseract/`.
- `main` 병합 때 GameHub `deploy.yml` → `deploy-tesseract.yml` → 공통 `deploy-workspace-game.yml` 이 검사·빌드를 통과한 산출물(`dist`, `server-dist`, `scripts/aws`)만 `~/tesseract` 에 올리고 허브(`gamehub`)를 재시작한다. 재시작하면 모든 게임의 진행 중인 방이 사라진다. 수동 재배포는 Actions → Deploy tesseract.
- 온라인 대전은 공통 방식이다: 방 코드 4자리, 대기실 → 방장 시작(빈자리는 봇), 끊긴 사람의 차례는 45초 뒤 봇이 대신, 게임 중 나가면 그 자리는 봇이 이어받는다(GameHub `docs/refactor-plan.md` 9절). 봇은 서버가 둔다.
- 예전 단독 운영(포트 8092, systemd `tesseract`, 행동 기록 동기화 서버 `server/room.ts`)은 2026-11-25 새 구조로 옮기며 없앴다.

## 서브에이전트

- `rules-auditor`: 엔진 구현이 `docs/rule.md`와 일치하는지 검증 (읽기 전용)
- `engine-tester`: 규칙 조항별 Vitest 테스트 작성
- `mobile-ui-reviewer`: 모바일 사용성·접근성 검토 (읽기 전용)
