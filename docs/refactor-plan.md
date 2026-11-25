# 리팩토링 계획: 기술스택 통일 + iPhone 17 Pro UI/UX

2026-11-25 승인. 이 문서가 리팩토링의 기준이다. 결정 내용은 맨 끝에 있다.

## 1. 목표

1. 15개 게임을 같은 기술스택·같은 폴더 구조로 재구성한다.
2. 15개 게임의 UI/UX를 iPhone 17 Pro 세로 화면 기준으로 다시 만든다.
3. **게임 규칙은 바꾸지 않는다.** 규칙·밸런스 문제를 발견하면 고치지 않고 따로 보고한다.

작업은 `dev`에만 반영한다. `main` 병합(운영 배포)은 사용자가 요청할 때만 한다.

## 2. 현재 상태

테스트를 뺀 코드 약 10만 줄, 테스트 약 1.5만 줄(파일 확장자·이름 기준 집계). `magicacademy`는 테스트 파일이 없다.

| 구분 | 게임 |
|---|---|
| 순수 JS 클라이언트 (6) | crease, hearsay, lastgrain, lightcone, retrocause, sightline |
| TS, React 없음 (3) | doubleagent, election, proxymind |
| React (6) | eleven, magicacademy, neoterra, rootbound, smilepark, tesseract |

| 통신 | 게임 |
|---|---|
| ws (7) | doubleagent, election, eleven, magicacademy(+Express), neoterra, proxymind, tesseract |
| SSE+POST (6) | crease, hearsay, lastgrain, lightcone, retrocause, sightline |
| socket.io (1) | rootbound |
| 서버 통신 없음 (1) | smilepark |

## 3. 목표 기술스택

| 영역 | 선택 | 비고 |
|---|---|---|
| 언어 | TypeScript strict | JS 엔진은 TS로 옮긴다 |
| 클라이언트 | React 19 + Vite | 이미 6개 게임이 React |
| 스타일 | Tailwind CSS v4 + 공통 토큰 | tesseract·magicacademy가 사용 중. neoterra·rootbound의 큰 CSS는 다시 써야 한다 |
| 클라이언트 상태 | React 기본 기능, 필요한 게임만 zustand | |
| 서버 | Node 22 + `ws`, `node:http` | Express·socket.io·SSE 제거 |
| 서버 빌드 | esbuild 단일 번들 + `hub-entry.mjs` | 지금의 inproc 계약 유지 |
| 테스트 | Vitest + Playwright(iPhone 화면) | |
| 린트 | ESLint flat config | |

### 폴더 구조

```
packages/
  ui/       # 게임 셸(아래 5절), 시트, 버튼, 토큰
  net/      # 방·좌석·재접속 클라이언트와 서버 공통 코드
  config/   # tsconfig, eslint, vite, 서버 번들, 배포 스크립트, iPhone 화면 확인 도구
  example/  # 새 구조의 본보기 게임(허브 로비에는 없음)
games/<slug>/
  src/engine/   # 순수 TS 규칙 (React·DOM·시간·난수 직접 사용 금지)
  src/def.ts    # 공통 방·진행 코드에 엔진을 연결하는 GameDef (서버·브라우저 공용)
  src/client/   # React 화면
  server/app.ts # createRoomApp(def)
  scripts/aws/hub-entry.mjs
```

- 루트에 npm workspaces를 둔다. 지금은 게임마다 `npm ci`를 하므로 CI·배포 워크플로를 함께 고친다.
- CI·배포의 경로 필터에 `packages/**`를 넣는다. 공통 코드를 바꾸면 15개 게임이 모두 다시 빌드·배포된다.
- `docs/phase2-design.md`의 2b(공통 방·봇 SDK)를 `packages/net`으로 진행한다.

## 4. iPhone 17 Pro 기준

| 항목 | 기준 |
|---|---|
| 화면 | 402×874pt, 3배율, 세로 |
| 높이 | `100dvh`. Safari 주소창이 있을 때의 실제 높이는 실기기에서 재서 적는다 |
| 안전 영역 | `viewport-fit=cover` + `env(safe-area-inset-*)`. 수치를 고정해 쓰지 않는다 |
| 터치 | 누르는 대상 44×44pt 이상, hover에만 의존하는 정보 없음 |
| 글자 | 입력창 16px 이상(자동 확대 방지), 본문 14px 이상 |
| 스크롤 | 대국 화면은 가로 스크롤·페이지 스크롤 없음. 긴 목록은 영역 안에서 스크롤 |
| 가로 화면 | 지원하지 않고 "세로로 돌려 주세요" 안내 |
| PC | 가운데에 같은 폭의 세로 화면. 별도 배치를 만들지 않는다 |

운영 주소가 HTTP라서 service worker, Wake Lock처럼 HTTPS가 필요한 기능에는 의존하지 않는다.

## 5. 화면 배치 (Board Game Arena 배치 기준)

디자인(색·모양)은 게임마다 다를 수 있고, **배치**를 통일한다.

```
┌───────────────────────────┐ 안전 영역 (위)
│ ① 상태바: 차례 · 할 일      ≡ │ 고정
├───────────────────────────┤
│ ② 플레이어 패널 (가로 한 줄)    │ 탭하면 상세
├───────────────────────────┤
│ ③ 공용 보드                  │ 남는 높이 전부, 확대·이동
├───────────────────────────┤
│ ④ 내 영역 (손패 · 개인판)      │ 없는 게임은 생략
├───────────────────────────┤
│ ⑤ 행동 버튼: 확인 · 취소 · 패스  │ 고정
└───────────────────────────┘ 안전 영역 (아래)
   ≡ → 로그 · 규칙 · 도움말 (아래에서 올라오는 시트)
```

- BGA는 행동 버튼을 상태바에 두지만, 한 손 조작을 위해 아래(⑤)에 둔다(2026-11-25 결정).
- 대기실, 방 만들기·참가, 결과 화면도 `packages/ui`의 공통 화면을 쓴다.
- 게임마다 작업 첫 단계에서 "지금 화면의 어떤 요소가 ①~⑤ 어디로 가는지"를 표로 만든다.

## 6. 게임별 완료 기준

1. 규칙 동일: 기존 테스트 통과 + 같은 시드·행동 순서에서 옛 엔진과 새 엔진의 상태가 같다.
2. 흐름 동일: 지금 되는 모드(봇, 온라인, 재접속, 이어하기 등)를 먼저 목록으로 만들고 모두 확인한다.
3. 화면: iPhone 17 Pro 크기의 Playwright 캡처에서 4·5절 기준을 만족한다.
4. 허브: 상대경로, `<slug>:` 저장 키, inproc 실행이 `/<slug>/`에서 동작한다.
5. 문서: 그 게임의 `CLAUDE.md`를 새 구조에 맞게 고친다.

기존 방·저장 데이터의 호환은 보장하지 않는다. 배포하면 진행 중인 방은 지금처럼 사라진다.

## 7. 진행 순서

| 단계 | 내용 | 끝나는 조건 |
|---|---|---|
| 0 | 이 문서 확정 | 완료(2026-11-25) |
| 1 | 기반: `packages/*`, 공통 CI·배포 템플릿 | 완료(2026-11-25): `packages/example` 이 허브에서 실행 |
| 2 | 시범: **crease**(순수 JS, SSE, 서버 봇), **tesseract**(React, ws, 테스트 많음) | 사용자가 실기기에서 확인. crease·tesseract 는 옮김(2026-11-25, 실기기 확인 대기) |
| 3-a | lastgrain, lightcone, sightline | 완료(2026-11-25): 리뷰 반영 후 운영 배포 |
| 3-b | hearsay, retrocause, proxymind | 〃 |
| 3-c | doubleagent, election, smilepark | 〃 |
| 3-d | magicacademy(테스트 먼저 작성), eleven | 〃 |
| 3-e | neoterra, rootbound | 〃 |

공통 코드(`packages/*`)와 허브·워크플로를 바꾸는 작업은 한 번에 한 곳에서만 한다.

## 8. 게임 옮기는 방법

`packages/example` 의 구조를 그대로 따른다.

1. 지금 되는 모드와 화면 요소를 목록으로 만들고, 5절의 ①~⑤ 배치 표를 쓴다.
2. 규칙 엔진을 `src/engine/` 의 TypeScript 로 옮기고, 옛 엔진과 같은 시드·행동으로 상태가 같은지 비교하는 테스트를 먼저 통과시킨다.
3. `src/def.ts` 에 `GameDef` 를 쓴다. `view` 는 그 좌석이 봐도 되는 것만 돌려주고, `apply` 는 거절할 때 상태를 건드리지 않고 `RuleError` 를 던진다.
4. 화면은 `@gamehub/ui` 의 `HomeScreen`·`WaitingRoom`·`GameShell` 로 만든다. 색은 `--gh-*` 변수만 바꾼다.
5. `e2e/mobile.mjs` 로 한 기기·온라인 흐름을 끝까지 두며 화면 캡처를 확인한다.
6. 루트 `package.json` 의 `workspaces` 와 `lint` 에 게임을 더하고, 게임의 `package-lock.json` 을 지운다.
7. `ci-<slug>.yml` 은 지우고 `ci-workspace.yml` 의 paths 에 게임을 더한다. `deploy-<slug>.yml` 은 `deploy-workspace-game.yml` 을 부르는 몇 줄로 바꾼다.
8. 게임의 `CLAUDE.md` 를 새 구조에 맞게 고친다.

`npm install` 은 이 PC 에서 `...\personal\GameHub` 표기 경로에서 실행한다.

## 9. 공통 진행 방식 (옛 게임과 달라지는 점)

- 온라인은 항상 대기실 → 방장 시작. 시작할 때 빈자리는 봇이 앉는다.
- 방을 아무도 보고 있지 않으면 봇과 대리 진행이 멈춘다(휴대폰에서 다른 앱을 여는 동안 판이 끝나지 않게).
- 접속이 끊긴 사람의 차례는 45초 뒤 봇이 대신한다(게임별로 바꿀 수 있다).
- 게임 중 나가면 그 자리는 봇이 이어받고 돌아올 수 없다.
- 방 코드는 4자리, 접속 토큰은 서버가 좌석마다 발급한다.
- 실시간 게임은 `GameDef.clock`(2026-11-25, lastgrain): 진행 쪽(서버·한 기기 Match) 시계로 행동 직전과 1초마다 상태를 흘려 다시 보낸다. 시간이 흘러도 version 은 그대로라 고르던 행동이 거절되지 않는다(시계로 둘 사람이 바뀔 때만 오른다). 시계만 흐른 것은 방 활동으로 치지 않고, 아무도 보고 있지 않으면(온라인) 또는 일시정지하면(한 기기) 시계도 멈춘다.
- 아직 공통 코드에 없는 것: 내보내기, 방 상태 저장, 차례 제한 시간. 필요한 게임 묶음에서 더한다.

## 10. 결정 (2026-11-25)

1. 스타일: Tailwind CSS v4.
2. 통신: 모두 `ws`로 통일.
3. 시범 게임: crease + tesseract.
4. 가로 화면 미지원, 기존 방·저장 데이터 비호환.
5. Hide 미션을 쓰지 않고 한 세션에서 직접 진행한다.

3절의 라이브러리 승인은 게임별 `CLAUDE.md`의 "새 라이브러리는 먼저 확인" 규칙에 대한 승인을 겸한다.
