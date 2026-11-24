# CREASE 웹 시뮬레이터

규칙의 기준은 `rules/rulebook.md`다. 이 폴더는 그 규칙을 구현한 엔진, 봇, 시뮬레이터, 웹 화면이다.

| 파일 | 역할 |
|---|---|
| `engine.js` | 규칙 엔진 (브라우저·서버·테스트 공용) |
| `rules-config.js` | 룰북의 확정 수치 (`test/rulebook-sync.test.js`가 룰북 표와 대조) |
| `bot.js` | 한 차례 전수 탐색 봇 (성향: 균형·독주·방해) |
| `sim.js` | 일괄 시뮬레이션 (CLI: `npm run sim`, 웹 시뮬레이션 화면에서도 사용) |
| `web/` | 화면: 홈, 한 기기 플레이, 온라인 대전, 봇 대전 관전, 밸런스 시뮬레이션, 규칙 요약 |
| `../scripts/aws/serve.mjs`, `rooms.mjs` | 서버: 정적 파일 + 온라인 대전방 API(SSE) |

## 실행

```
npm run build                      # dist/ 생성
PORT=8199 node scripts/aws/serve.mjs   # http://localhost:8199
```

바로 시작 링크: `/?play=3`(나 vs 봇 3인), `/?watch=4`(봇 4인 관전), `/?room=ABCD`(온라인 방 참가)

## 온라인 대전 API

| 요청 | 설명 |
|---|---|
| `POST /api/rooms` `{n, name}` | 방 만들기 → `{code, token, seat}` |
| `POST /api/rooms/:code/join` `{name}` | 참가 |
| `POST /api/rooms/:code/seat` `{token, seat, kind}` | (방장) 빈자리 ↔ 봇 |
| `POST /api/rooms/:code/start` `{token}` | (방장) 시작, 남은 빈자리는 봇 |
| `POST /api/rooms/:code/act` `{token, action}` | 행동: `step{to}`, `fold{side,width}`, `unfold{side}`, `end` |
| `GET /api/rooms/:code/events?token=` | SSE 실시간 상태 (토큰 없으면 관전) |

- 서버가 엔진으로 모든 행동을 검증한다. 봇 차례는 서버가 진행한다.
- 연결이 끊긴 플레이어의 차례는 45초 뒤 봇이 대신 진행한다.
- 방은 메모리에만 있으며, 3시간 동안 아무도 없으면 정리된다.
