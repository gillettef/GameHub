/**
 * shared/fixtures/*.json 을 생성한다. TS 엔진 출력이 기준이고,
 * Python(ai/tests) 은 이 파일을 읽어 모델·규칙 일치를 검증한다.
 *
 *   npx tsx shared/scripts/write-fixtures.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyAction, createInitialState, createPlayer, joinPlayer } from '../src/engine/index.js';
import { DEFAULT_DECK_CHOICE } from '../src/data/index.js';
import { BUILDINGS, MAGICS, UNITS, BASE_DECK } from '../src/data/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', 'fixtures');
mkdirSync(out, { recursive: true });

let s = createInitialState('fixture-room', 42);
s = joinPlayer(s, createPlayer('p1', '철수')).state;
s = joinPlayer(s, createPlayer('ai-1', 'AI', 'ai')).state;
s = applyAction(s, { type: 'SELECT_DECK', playerId: 'p1', choice: DEFAULT_DECK_CHOICE }).state;
s = applyAction(s, { type: 'SELECT_DECK', playerId: 'ai-1', choice: { buildingId: 'nexus', unitId: 'phantom', magicId: 'rally' } }).state;
s = applyAction(s, { type: 'READY', playerId: 'p1' }).state;
s = applyAction(s, { type: 'READY', playerId: 'ai-1' }).state;
const started = s;
// 1턴은 생산·드로우가 없으므로, 생산이 일어나는 2턴 진입 직후 상태를 픽스처로 남긴다
let t = applyAction(started, { type: 'END_TURN', playerId: 'p1' }).state;
t = applyAction(t, { type: 'END_TURN', playerId: 'ai-1' }).state; // → turn 2, p1 생산
const afterEndTurn = t;

const write = (name: string, data: unknown) => {
  writeFileSync(join(out, name), JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log(`wrote fixtures/${name}`);
};

write('started-state.json', started);
write('after-end-turn.json', afterEndTurn);
write('specs.json', { buildings: BUILDINGS, units: UNITS, magics: MAGICS, baseDeck: BASE_DECK });
