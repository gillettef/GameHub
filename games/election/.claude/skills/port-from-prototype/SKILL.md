---
name: port-from-prototype
description: docs/election-mancala-standalone.html 프로토타입의 기능(규칙, AI, 화면, 모드)을 Vite+TS 본 구현으로 옮길 때의 절차. "프로토타입에서 ~ 옮겨", "~ 구현해" 처럼 프로토타입에 이미 있는 기능을 구현할 때 사용.
---

# 프로토타입 → 본 구현 포팅 절차

## 0. 사전 확인
- 스캐폴딩이 없으면(`package.json` 없음) 먼저 사용자에게 알리고 Vite `vanilla-ts` 템플릿 + Vitest로 만든다. 디렉터리 구조는 CLAUDE.md의 아키텍처를 따른다.
- core 작업이면 `game-rules` 스킬을 먼저 읽는다.

## 1. 프로토타입에서 위치 찾기
- `docs/election-mancala-standalone.html`에서 해당 함수/마크업을 찾는다. 변수명이 축약되어 있으니 `game-rules` 스킬의 대응표를 참고.
- 그 기능이 읽고 쓰는 상태 필드, 호출하는 함수를 모두 나열한다. 숨은 부수효과(`s.hl` 설정, `LOG` 기록, `render()`/`sync()` 호출)를 core 로직과 분리해 적어 둔다.

## 2. 계층 나누기
| 프로토타입의 것 | 갈 곳 |
|---|---|
| 상태 변경, 판정, 점수 | `src/engine/rules.ts` (순수 함수, 불변 업데이트) |
| AI 평가·탐색 | `src/engine/ai.ts` (rng 인자 주입) |
| `sleep`, `busy`, 자동 하차 연출 박자 | `src/client/playback.ts` (진행·봇 호출은 공통 `@gamehub/net`, 연결은 `src/def.ts`) |
| `room.emit/on`, 버전 `n` | `src/net/` (인터페이스만) |
| `innerHTML` 문자열, CSS, 하이라이트 | `src/client/` (React) |

## 3. 테스트 먼저
- 프로토타입 동작을 고정하는 테스트를 작성한다. 구체적인 보드 상태 → 액션 → 기대 상태.
- 규칙 로직이면 최소한: 정상 경로, 포화 권역 건너뛰기, 버스 토큰 소멸, 깃발 동점, 종료 조건, 턴 교대 시 place 건너뛰기.
- 가능하면 **패리티 테스트**: 프로토타입 함수를 `test/fixtures/prototype.ts`로 그대로 추출(원본 수정 없이 복사)하고, 같은 시드의 랜덤 액션 시퀀스를 양쪽에 적용해 상태(UI 전용 필드 제외)가 일치하는지 비교한다.

## 4. 구현
- 이름은 의미 있게(`S`→`state`, `cl`→`cloneState` 대신 불변 업데이트 등).
- 프로토타입의 동작상 버그로 보이는 것을 발견하면 **조용히 고치지 말고** 사용자에게 보고하고 결정을 받는다.

## 5. 검증
- `npm run typecheck && npm run test`.
- UI가 바뀌었다면 `mobile-check` 스킬 실행.
- 규칙 관련 대규모 변경이면 `rules-auditor` 에이전트로 독립 감사.
