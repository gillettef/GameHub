# 2단계 설계: 단일 프로세스 + 공통 방·봇 SDK

> 2026-11-26 rootbound 는 nyangalley(냥냥 골목)로 이름을 바꿨다. 이 문서의 게임 이름은 새 이름으로 고쳐 적었다(옛 주소 `/rootbound/` 는 허브 별칭으로 새 주소로 넘어간다).

2026-11-24 조사. 15개 게임 서버 코드를 읽어 정리한 현황과 이행 계획이다. 결정이 필요한 항목은 맨 끝에 모았다.

## 1. 왜 하는가

- 공용 EC2(t4g.nano, 메모리 0.4GB, 스왑 사용 중)에 **프로세스 17개**가 따로 돈다:
  허브 1 + 게임 Node 15 + nyangalley Python AI(uvicorn) 1.
- Node 프로세스는 빈 상태에서도 V8 힙·런타임으로 수십 MB씩 쓴다. nyangalley는 운영에서도 `npx tsx`로 TS를 실행할 때 컴파일해서 더 무겁다.
- 15개 게임이 방 코드·토큰·재접속·방 정리·봇 스케줄링을 각자 따로 구현했다(같은 기능이 15번, 이름과 형식만 다름).

> 실측 필요: 운영 서버에서 `ps -eo rss,comm --sort=-rss | head -20`으로 프로세스별 RSS를 한 번 재서 이 문서에 적는다(통합 효과 비교 기준).

## 2. 현황 요약

| 게임 | 통신 | HTTP 스택 | 서버 봇 | 온라인 봇 좌석 | 저장 | 서버 구조 | 통합 난이도 |
|---|---|---|---|---|---|---|---|
| smilepark | 없음(클라 전용) | node:http 정적 | – | – | localStorage | serve.mjs 40줄 | 매우 쉬움 |
| crease | SSE+POST | node:http | O | O | 메모리 | `createRooms` DI | 쉬움 |
| lightcone | SSE+POST | node:http | X(클라) | X | 메모리 | `createRoomService` DI | 쉬움 |
| lastgrain | SSE+POST | node:http | X(클라) | X | 메모리 | `createRooms` DI, `startServer` export | 쉬움 |
| eleven | ws `/ws` | node:http | O | O | 메모리 | `createApp`/`attachWebSocket`/`RoomManager` | 쉬움 |
| doubleagent | ws `/ws` | node:http | O(동기) | O | 메모리 | `Hub` 클래스 + Conn 추상화 | 쉬움 |
| proxymind | ws `/ws` | node:http | O | O | 메모리 | `Hub` 클래스(doubleagent 파생) | 쉬움 |
| retrocause | SSE+POST | node:http | O | O | 메모리 | `RoomHub` DI, serve.mjs에 전역 | 보통 |
| hearsay | SSE+POST | node:http | O | O | 메모리 | 모듈 전역 + import 시 타이머 | 보통 |
| sightline | SSE+POST | node:http | O | O | 메모리 | 모듈 전역 + import 시 타이머 | 보통 |
| tesseract | ws `/ws` | node:http | O(동기) | O(생성 시) | 메모리 | 모듈 전역 | 보통 |
| election | ws `/api/room/:code` | node:http | X(클라) | X | 메모리 | 모듈 전역, `process.on` | 보통 |
| neoterra | ws `/ws` | node:http | O | O | 메모리 | 모듈 전역 3개, `process.on` | 보통 |
| magicacademy | ws `/ws` | Express | O | O | 메모리 | 모듈 전역 싱글톤, tsc 산출물 | 보통 |
| nyangalley | socket.io | Express+cors+compression | Python 사이드카 | O | **파일 스냅샷(재시작 복원)** | tsx 직접 실행 | 어려움 |

공통점:
- 규칙 엔진은 순수 JS/TS이고 서버 권위다. 대부분 클라이언트와 엔진을 공유한다.
- 운영 클라이언트는 이미 상대경로라 `/<slug>/` 아래 어디에 마운트해도 동작한다(1단계 성과).
- nyangalley를 빼면 모두 메모리 저장이라 재시작하면 방이 사라진다.

## 3. 큰 방향: 두 단계로 나눈다

**2a. 단일 프로세스(프로토콜 그대로)**와 **2b. 공통 SDK(프로토콜 통일)**를 분리한다.

- 2a는 서버 측 배선만 바꾸고 클라이언트·와이어 프로토콜은 건드리지 않는다. 메모리 효과는 거의 다 2a에서 나온다.
- 2b는 클라이언트 수정이 따르므로 게임별로 천천히 한다. 2a가 끝나야 공통 코드를 한 프로세스에서 공유할 수 있다.

### 2a. 단일 프로세스 호스트

허브(`hub/server.mjs`)를 프록시에서 **호스트**로 바꾼다. 각 게임은 서버를 직접 띄우지 않고 모듈 하나를 내보낸다.

```js
// games/<slug>/hub-entry.mjs (게임마다 하나, 빌드 산출물을 가리킨다)
export async function mount(ctx) {
  // ctx = { slug, root(게임 산출물 디렉터리), dataDir, log, clientIp(req), timers }
  return {
    handle(req, res, url) { /* url.pathname 은 /<slug> 접두어를 뗀 경로. 처리했으면 true */ },
    upgrade(req, socket, head) { /* WebSocket. 처리했으면 true */ },
    async close() { /* 타이머·연결 정리 */ },
  };
}
```

호스트가 맡는 것:
- `/<slug>/` 접두어 떼기, `/<slug>` → `/<slug>/` 리다이렉트(지금 허브 로직 그대로)
- 게임별 정적 파일 서빙(지금 serve.mjs마다 복사된 템플릿 하나로 통일): SPA 폴백, `/assets/` immutable, 디렉터리 탈출 방지, 서버 코드 경로 차단
- 게임 하나의 예외가 프로세스를 죽이지 않게 handle/upgrade를 try/catch로 감싸고, 전역 `uncaughtException`은 로그만 남긴다(게임 쪽 `process.on`, `process.exit`는 제거)
- 하트비트·sweep 타이머의 수명주기(close 시 일괄 정리)
- 클라이언트 IP는 `ctx.clientIp(req)` 하나로(지금 lastgrain·crease·nyangalley의 IP 제한은 허브 뒤에서 모두 127.0.0.1로 보여 사실상 전체 공용 한도가 돼 있다)
- 메모리 한도: systemd `MemoryMax`와 Node `--max-old-space-size`를 하나로 관리

기존 단독 실행(`node scripts/aws/serve.mjs`, 개발 서버)은 `mount()`를 감싸는 얇은 래퍼로 남겨 각 게임의 로컬 개발·테스트 방식을 유지한다.

#### 게임별로 손볼 것

| 게임 | 할 일 |
|---|---|
| smilepark | 정적 서빙만. hub-entry는 `handle` 없이 정적 루트만 넘긴다. |
| crease, lightcone, lastgrain | 이미 팩토리다. serve.mjs의 라우터를 `handle()`로 꺼내고 top-level await·listen을 제거한다. lastgrain의 200ms step 타이머는 close에서 정리. |
| eleven | `createApp` 안의 `createServer`를 빼고 http 핸들러와 `attachWebSocket`을 노출. `WebSocketServer({noServer:true})`로 바꾸고 `handleUpgrade` 호출. |
| doubleagent, proxymind | `Hub`는 그대로. index.ts의 http/ws 배선만 mount로 교체. 하트비트 interval을 close에서 정리. |
| retrocause | serve.mjs의 전역 `hub`·`streams`·20초 interval을 mount 안으로. sweep할 때 봇 타이머를 해제하지 않는 버그도 함께 고친다. |
| hearsay, sightline | `rooms.mjs`의 모듈 전역 Map과 import 시 setInterval을 팩토리로 바꾼다. sightline 테스트(자식 프로세스 spawn, 고정 포트)도 손본다. |
| tesseract | 전역 `rooms`를 mount 안으로. 봇이 WS 핸들러 안에서 동기로 연속 실행된다(아래 위험 참고). |
| election | `process.on` 제거, `cwd` 고정 dist를 `ctx.root`로. upgrade 경로 `/api/room/:code`는 그대로 둔다. |
| neoterra | `process.on` 제거, 전역 Map 3개를 mount 안으로, `cwd` 고정 dist를 `ctx.root`로. |
| magicacademy | Express `app`은 `(req,res)` 함수라 그대로 `handle`에 쓸 수 있다. `createServer`/`listen`과 `../../client/dist` 하드코딩만 빼고, 봇 튜닝 env(`BOT_*`, `DUEL_TARGET`)는 `ctx`로 받는다. |
| nyangalley | 마지막. (1) esbuild로 서버를 번들해 운영에서 tsx를 없앤다. (2) socket.io를 `path: '/socket.io'` + 수동 upgrade 라우팅으로 붙인다. (3) `process.exit(1)` 제거, `DATA_DIR`을 `ctx.dataDir`로. (4) Python AI는 결정 필요(아래). |

#### 배포 변화

- systemd 유닛 15개 + 허브 → 유닛 1개(`gamehub`)(+ nyangalley Python을 남기면 2개).
- 배포는 "게임 산출물 업로드 → `gamehub` 재시작" 한 번이다. 게임 하나만 바꿔도 전체가 재시작되고 **모든 게임의 진행 중인 방이 사라진다**(지금은 그 게임만 사라짐). 대응: 배포 시간대 안내, 또는 2b에서 방 스냅샷(nyangalley 방식)을 공통화.
- 이행 중에는 혼합 운영이 가능하다: 호스트가 mount된 게임은 직접 처리하고, 아직 안 옮긴 게임은 지금처럼 프록시한다(`games.json`에 `"mode": "inproc" | "proxy"`). 그래서 한 게임씩 옮기고 그때마다 그 게임의 systemd 유닛을 끈다.

#### 위험

- **이벤트 루프 공유.** tesseract(탐욕 playout 6단)·doubleagent(depth 4)·proxymind(배치 60가지 × 대응) 봇이 동기로 돈다. 한 방의 봇 계산이 모든 게임의 응답을 멈춘다. 먼저 봇 한 수 계산 시간을 재고, 50ms를 넘는 게임만 `worker_threads` 풀로 옮긴다.
- **장애 전파.** 한 게임의 메모리 누수·무한 루프가 전체를 죽인다. 게임별 방 수 상한은 이미 있다(200~300). 호스트에 게임별 요청 수·방 수 지표를 `/health`로 노출한다.
- **메모리 한도.** 한 프로세스의 힙 하나에 15개 게임 상태가 모이므로 `--max-old-space-size`를 정해야 한다.

### 2b. 공통 방·봇 SDK

2a가 끝난 뒤 시작한다. 새 게임과, 가장 단순한 기존 게임부터 옮긴다.

```ts
interface GameDef<State, Action, View> {
  seats: { min: number; max: number };
  setup(seats: SeatInfo[], rng: Rng): State;
  validate(state: State, seat: number, action: unknown): Action | Error;  // 형식·합법성
  apply(state: State, seat: number, action: Action, rng: Rng): State;
  viewFor(state: State, seat: number | null): View;                       // null = 관전
  bot?: { choose(view: View, seat: number, level: string): Action; thinkMs?: [number, number] };
  tick?: { everyMs: number; run(state: State, now: number): State };     // 실시간 게임(hearsay, lastgrain)
  isOver(state: State): boolean;
}
```

SDK가 맡는 것(지금 15번 따로 구현된 것):
- 방 레지스트리: 코드 발급(혼동 글자 제외, crypto), 상한, idle 정리
- 좌석: human / bot / open, 방장과 방장 이양, 시작 시 빈 자리 봇 채우기
- 신원: 공개 pid와 비밀 token 분리(eleven·doubleagent 방식), 재접속, 같은 사람 새 연결 시 이전 연결 종료
- 이탈: 대기실 n초 후 제외, 게임 중 n초 후 봇 대리, 복귀 시 되찾기(neoterra·crease·retrocause 방식)
- 관전: `viewFor(state, null)`
- 봇 스케줄러: 생각 시간, 연속 실패 중단, 보는 사람 없으면 일시정지, 무거운 봇은 worker
- 전송: WebSocket과 SSE+POST 둘 다 같은 메시지 형식(`{t: ...}`)으로. 클라이언트 SDK(재접속·토큰 저장 `<slug>:` 접두어 포함)도 함께 제공
- 선택: 방 스냅샷 저장·복원(nyangalley 방식), 배포 재시작 시 방 유지

출발점으로 쓸 코드: eleven `RoomManager`+`BotDriver`(토큰 분리, 관전), doubleagent `Hub`(Conn 추상화), crease `createRooms`(DI, 좌석 종류), nyangalley(차례 제한 시간·AI 대리·스냅샷).

## 4. 조사 중 발견한 문제(2단계와 별개로 고칠 것)

| 심각도 | 게임 | 문제 |
|---|---|---|
| ~~높음~~ 고침(2026-11-24) | magicacademy | 재접속 키인 `playerId`가 방 전원에게 방송된다(`server/src/index.ts:54-55`). 같은 방 사람이 남의 자리로 `rejoin_room` 할 수 있다. 비밀 토큰을 따로 둬야 한다. |
| 중간, **2b로 보류**(2026-11-24 결정) | tesseract | 스냅샷에 `config.seed`가 그대로 나가 클라이언트가 이후 난수(시장 굴림·다시 굴리기·주머니·이후 목표/사건 카드)를 예측할 수 있다(`server/room.ts:284`). 온라인도 클라이언트가 시드+행동 기록을 재생하는 구조라 시드만 뺄 수 없다. 친구끼리는 악용 가능성이 낮아 두고, 2b에서 서버가 좌석별로 가린 상태를 보내는 구조로 옮길 때 고친다. |
| ~~중간~~ 고침(2026-11-24) | lastgrain, crease, nyangalley | IP별 제한이 `req.socket.remoteAddress`를 써서 허브 뒤에서는 모든 사용자가 127.0.0.1 하나로 묶인다. 허브는 이미 `x-forwarded-for`를 넘긴다. |
| 낮음(봇 타이머는 고침 2026-11-24) | retrocause | sweep이 방을 지울 때 봇 `setTimeout`을 해제하지 않는다. 방이 없을 때도 404가 아니라 400을 돌려준다. |
| 낮음 | sightline | `start`가 빌드를 하지 않아 `dist/engine`이 없으면 서버가 뜨지 않는다(지금은 CI가 빌드 후 올려서 괜찮음). |

## 5. 이행 순서(제안)

진행 상황(2026-11-24): 2번 호스트 골격 완료(`hub/server.mjs`, `hub/lib/static.mjs`, `hub/test/`), 3번 완료: smilepark·crease·lightcone·lastgrain(운영 확인) → eleven·doubleagent·proxymind(운영 확인) → retrocause·hearsay·sightline(운영 확인) → tesseract·election·neoterra(운영 확인) → magicacademy(운영 확인). 6번 nyangalley(2026-11-25): Python AI 를 TS 로 이식(Python 과 4,654개 상태에서 같은 수)·사이드카 제거, esbuild 단일 번들, socket.io 를 같은 http.Server 의 request·upgrade 로 연결, `~/AstralTab` → `~/rootbound`(지금 `~/nyangalley`) 데이터 이전은 deploy-remote.sh. 이것으로 15개 모두 inproc. 다음: 7번(배포 워크플로 단순화)·1번(운영 메모리 실측).
4번 봇 계산 시간(개발 PC, 2026-11-24): doubleagent 3인 normal 라운드 정산 중앙 7ms·최대 28ms, proxymind 5인 봇 설계 1회 최대 11ms·개입 1ms 이하. t4g.nano 가 몇 배 느려도 100ms 안팎이라 worker 없이 둔다. tesseract 4인: 봇 한 수 최대 7ms, 사람 차례 사이 봇 연속 계산 최대 25ms.


1. 운영 메모리 실측(기준선).
2. 호스트 골격: `hub/` 안에 mount 로더, 정적 서빙, 예외 격리, `inproc`/`proxy` 혼합. 처음엔 모든 게임 `proxy` → 동작 동일 확인.
3. smilepark → crease → lightcone → lastgrain → eleven → doubleagent → proxymind (쉬운 순).
   게임마다: hub-entry 작성 → 로컬에서 허브 경유 테스트 → `inproc` 전환 → 그 게임 systemd 유닛 중지.
4. 봇 계산 시간 측정, 필요하면 worker 풀.
5. retrocause → hearsay → sightline → tesseract → election → neoterra → magicacademy.
6. nyangalley(번들, socket.io, Python 결정).
7. 배포 워크플로 단순화(유닛 1개), 각 게임 `deploy-<slug>.yml` 정리.
8. 2b SDK 시작.

## 6. 결정이 필요한 것

1. ~~**nyangalley Python AI**~~ 결정(2026-11-25): (b) TS로 이식 후 Python 제거. `server/src/ai/search.ts` 가 엔진 함수를 그대로 부르고, 허브 이벤트 루프를 위해 8ms마다 양보한다.
2. **재시작 시 방 소실**: 단일 프로세스에서는 배포 한 번에 모든 게임의 방이 사라진다. 2a에서 감수할지, 방 스냅샷을 2a에 앞당길지.
3. **2b 범위**: 기존 게임의 와이어 프로토콜까지 SDK로 통일할지(클라이언트 수정 필요), 서버 내부 구조만 공통화할지.
