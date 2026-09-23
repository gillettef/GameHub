/**
 * shared/fixtures/*.json 을 생성한다. TS 엔진 출력이 기준이고,
 * Python(ai/tests) 은 이 파일을 읽어 모델·규칙 일치를 검증한다.
 *
 *   npm run fixtures   (= npx tsx shared/scripts/write-fixtures.ts)
 *
 *  specs.json          카드·코어·맵·상수 기준표
 *  started-state.json  setupGame 직후 (F018/F019: 코어 배치, 손패 4, 에너지 3, 시작 단계 전)
 *  first-turn.json     startGame 직후 (첫 플레이어 시작 단계까지)
 *  scenario.json       손패를 고정한 2인 대국의 액션 시퀀스와 각 단계 결과 상태.
 *                      Python 은 initial 에서 actions 를 차례로 적용해 states 와 (log 제외) 같은지 확인한다.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyAction, createInitialState, createPlayer, joinPlayer, setupGame, startGame, withMarkers } from '../src/engine/index.js';
import { ALL_SPECS, CONSTANTS, CORE_SPEC, DEFAULT_DECK_CHOICE, MAPS, getSpec } from '../src/data/index.js';
import type { Action, CardId, GameState, Marker, PlayerId, Position } from '../src/types/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', 'fixtures');
mkdirSync(out, { recursive: true });

const write = (name: string, data: unknown) => {
  writeFileSync(join(out, name), JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log(`wrote fixtures/${name}`);
};

// --- 로비 → 시작 -------------------------------------------------------------

let lobby = createInitialState('fixture-room', 'binary-star', 42);
lobby = joinPlayer(lobby, createPlayer('p0', '철수')).state;
lobby = joinPlayer(lobby, createPlayer('ai-1', 'AI', 'ai')).state;
lobby = applyAction(lobby, { type: 'SELECT_DECK', playerId: 'p0', choice: DEFAULT_DECK_CHOICE }).state;
lobby = applyAction(lobby, { type: 'READY', playerId: 'p0' }).state; // ai-1 은 이미 준비 완료 → 시작
if (lobby.phase !== 'playing') throw new Error('픽스처: 게임이 시작되지 않았습니다');

// READY 가 startGame 까지 진행하므로, setupGame 직후 상태는 따로 만든다
let ready = createInitialState('fixture-room', 'binary-star', 42);
ready = joinPlayer(ready, createPlayer('p0', '철수')).state;
ready = joinPlayer(ready, createPlayer('ai-1', 'AI', 'ai')).state;
ready = { ...ready, players: ready.players.map((p) => ({ ...p, deckChoice: DEFAULT_DECK_CHOICE, isReady: true })) };
const started = setupGame(ready);
const firstTurn = startGame(ready);
if (JSON.stringify(firstTurn) !== JSON.stringify(lobby)) throw new Error('픽스처: READY 경로와 startGame 경로가 다릅니다');

// --- 시나리오: 손패 고정, 전투·마법·파괴·탈락 포함 --------------------------------

function withHand(s: GameState, id: PlayerId, hand: CardId[], energy: number): GameState {
  return { ...s, players: s.players.map((p) => (p.id === id ? { ...p, hand, energy } : p)) };
}
let seq = 500;
function marker(ownerId: PlayerId, specId: CardId, pos: Position, hp?: number): Marker {
  const spec = getSpec(specId);
  return { id: `f${seq++}`, specId, kind: spec.kind, ownerId, pos, hp: hp ?? spec.hp, remainingTurns: null };
}

// 좌표는 odd-r 오프셋 육각 거리 기준. p0 코어 (3,2), ai-1 코어 (8,8) (binary-star).
// 코어 시야 1(작다)이라 초반부터 전초기지·포격함으로 시야를 밀고 나가야 중앙에서 맞붙는다.
let initial = firstTurn;
initial = withHand(initial, 'p0', ['outpost', 'artillery', 'meteor', 'extractor', 'stealth'], 14);
initial = withHand(initial, 'ai-1', ['scout', 'fighter', 'shield', 'warp-gate', 'repair-drone'], 12);
initial = withMarkers(initial, [
  ...initial.markers,
  marker('ai-1', 'extractor', { x: 6, y: 10 }, 2), // 광맥, 체력 2
  marker('ai-1', 'scout', { x: 6, y: 6 }), // 중앙 전진 배치
  // 과부하(오토마타) TS·Python 교차 검증: 두 제작 노드가 서로 반경 1 안이라 매 턴 수입에
  // 이웃 보너스가 붙는다. 액션이 쓰는 칸과 겹치지 않는 구석(1,1)/(1,2)에 둔다.
  marker('p0', 'fab-node', { x: 1, y: 1 }),
  marker('p0', 'fab-node', { x: 1, y: 2 }),
]);

// 배치는 더 이상 턴을 끝내지 않으므로(Rules.md 5.2), 턴을 넘기려면 배치 뒤에 PASS(=턴 종료, 배치했으므로
// 패스로는 기록되지 않는다)를 명시적으로 끼워 넣는다. 앞의 두 턴은 일부러 PASS 없이 같은 턴에 배치를
// 두 번 연이어 해, 두 번째 배치가 "그 턴에 방금 놓인" 마커의 시야를 즉시 검증 기준으로 쓰는 경로
// (Rules.md 5.2 "매 배치는 그 시점의 상태를 기준으로 다시 검증한다")를 TS·Python 양쪽에서 실행 검증한다.
const actions: Action[] = [
  { type: 'PLACE', playerId: 'p0', cardId: 'outpost', pos: { x: 4, y: 2 } }, // 시야 확장
  { type: 'PLACE', playerId: 'p0', cardId: 'artillery', pos: { x: 5, y: 4 } }, // 같은 턴 연속 배치: 방금 놓은 전초기지(시야2) 안, 코어(시야1) 밖
  { type: 'PASS', playerId: 'p0' }, // 배치 후 턴 종료
  { type: 'PLACE', playerId: 'ai-1', cardId: 'warp-gate', pos: { x: 6, y: 5 } }, // 지속 마법
  { type: 'PLACE', playerId: 'ai-1', cardId: 'fighter', pos: { x: 6, y: 4 } }, // 같은 턴 연속 배치
  { type: 'PASS', playerId: 'ai-1' }, // 이 턴 종료가 p0 턴으로 넘겨 p0 시작 단계에서 포격함이 전투기를 즉시 공격한다 (사거리 3: 전투기 d1이 정찰·게이트 d2보다 먼저 맞는다)
  { type: 'PASS', playerId: 'p0' }, // p0 는 이번 턴에 놓지 않은 진짜 패스 — ai-1 턴으로 넘겨 ai-1 시작 단계에서 전투기가 포격함에 반격한다
  { type: 'PLACE', playerId: 'ai-1', cardId: 'shield', pos: { x: 5, y: 5 } }, // 회복
  { type: 'PASS', playerId: 'ai-1' }, // 배치 후 턴 종료
  { type: 'PLACE', playerId: 'p0', cardId: 'meteor', pos: { x: 5, y: 5 } }, // 즉발 피해: 반경1 안의 전투기·게이트·정찰 전부 동시 파괴
  { type: 'PASS', playerId: 'p0' }, // 배치 후 턴 종료
  { type: 'PLACE', playerId: 'ai-1', cardId: 'repair-drone', pos: { x: 7, y: 7 } },
  { type: 'PASS', playerId: 'ai-1' }, // 배치 후 턴 종료
  { type: 'PLACE', playerId: 'p0', cardId: 'stealth', pos: { x: 8, y: 7 } }, // 침투: 적 코어(8,8) 인접
  { type: 'PASS', playerId: 'p0' }, // 배치 후 턴 종료
  { type: 'PASS', playerId: 'ai-1' }, // 진짜 패스
  { type: 'PLACE', playerId: 'p0', cardId: 'extractor', pos: { x: 3, y: 3 } }, // 패스 연속 리셋
  { type: 'PASS', playerId: 'p0' }, // 배치 후 턴 종료 → ai-1 턴
  { type: 'SURRENDER', playerId: 'ai-1' },
];

const steps: { action: Action; state: GameState }[] = [];
let cur = initial;
for (const action of actions) {
  const r = applyAction(cur, action);
  if (r.error) throw new Error(`픽스처 시나리오 오류 (${JSON.stringify(action)}): ${r.error}`);
  cur = r.state;
  steps.push({ action, state: cur });
}
if (cur.phase !== 'finished') throw new Error('픽스처 시나리오가 종료되지 않았습니다');

write('specs.json', { constants: CONSTANTS, core: CORE_SPEC, cards: ALL_SPECS.filter((c) => c.kind !== 'core'), maps: MAPS });
write('started-state.json', started);
write('first-turn.json', firstTurn);
write('scenario.json', { initial, steps });
