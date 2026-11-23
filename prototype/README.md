# RETROCAUSE 디지털 프로토타입

룰의 기준은 언제나 `rules/rulebook.md`다. 이 폴더는 룰북을 코드로 옮겨 검증하고, 브라우저에서 봇과 플레이하기 위한 것이다. 외부 의존성은 없다(Node 20 이상).

| 경로 | 내용 |
|---|---|
| `src/cards.js` | 카드 세트 v0 데이터. `components/components.md` 표와 일치해야 한다(테스트가 검사) |
| `src/engine.js` | 규칙 엔진: 왼쪽 최근 사실 규칙, 금지 배치, 연쇄 정리, 결정 원인, 종료, 득점 |
| `src/bots.js` | 봇 전략(직진형·견제형·위장형·무작위), 추리 봇 |
| `src/view.js` | 플레이어 한 명에게 보낼 화면 데이터(남의 손패·비밀 목표 제외) |
| `src/rooms.js` | 온라인 방: 입장, 시작, 차례 검증, 봇 진행, 추리, 대리 진행(메모리 저장) |
| `test/` | 룰북 예시 테스트, 카드 문서 일치, 봇 300판 불변식 |
| `sim/run.mjs` | 봇 대전 통계 |
| `web/` | 모바일 우선 웹 플레이(혼자 연습 + 온라인 방). iPhone 17 Pro(402×874pt) 기준 |
| `web-rulebook.html`, `md.mjs` | 룰북을 모바일용 HTML(`rulebook.html`)로 변환 |
| `build.mjs` | `dist/`로 복사하는 빌드 |

## 명령

```
npm test                      # 룰북 예시·불변식 테스트
npm run sim -- --games 500 --players 3,4,5 --style mixed
npm run sim -- --games 500 --players 4 --hand 5 --slots 9,12,15 --paradox -2 --decisive 3 --activity 1
npm start                     # 빌드 후 http://localhost:8100 (온라인 방 API 포함)
```

시뮬레이터 결과는 봇 실력에 크게 좌우된다. 수치를 정할 때는 `balance-analyst` 분석과 실제 플레이테스트를 함께 근거로 쓴다.

## 룰을 바꿀 때

1. `rules/rulebook.md`를 고치고 `/design-log`로 기록한다.
2. `src/engine.js`를 같은 내용으로 고친다.
3. 룰북 예시가 바뀌었으면 `test/rulebook.test.js`도 고친다.
4. 카드가 바뀌었으면 `components/components.md`와 `src/cards.js`를 함께 고친다.

## 온라인 방 API (`scripts/aws/serve.mjs`)

`POST /api/rooms`(방 만들기) · `POST /api/rooms/:code/{join,leave,config,start,action,guess,takeover,rematch,view}` · `GET /api/rooms/:code/stream?token=`(SSE). 서버가 모든 판정을 하고, 각자에게 자기 손패와 비밀 목표만 보낸다. 방은 메모리에만 있어 서버를 재시작하면 사라진다. 6시간 동안 활동이 없는 방은 정리한다.
