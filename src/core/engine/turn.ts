// 차례 진행과 행동 적용 진입점 (Rules.md 9절). (state, action) => { state, error? }
import type { Action, ActionResult, GameState, PlayerState } from '../types';
import { BUILDING_KINDS, CHARTER_FIELDS, UNIT_KINDS } from '../types';
import { CARD_ROW_SIZE, FAMINE_CULTURE, GUARD_MAX, ROUND_LIMIT, ROW_DISCARD } from '../data/constants';
import { MISSION_DEFS } from '../data/missions';
import { SATELLITE_DEFS } from '../data/satellites';
import { defenseLeft, meets, playerMods, productionPreview } from './derive';
import { addDoctrine } from './effects';
import { applyMainAction } from './actions';
import { declareConflict, pullTrack, raid, resolveConflict } from './external';
import { advanceEraRest, advanceEraStart, eraShouldAdvance } from './era';
import { advanceTrack, respond, startThreatOn } from './quest';
import { ranking } from './scoring';
import { clone, log, withRng } from './util';
import { DOCTRINES } from '../types';

/** 행동 하나를 적용한다. 입력 상태는 바꾸지 않는다 */
export function applyAction(state: GameState, actor: number, action: Action): ActionResult {
  if (state.gameOver) return { state, error: '게임이 끝났습니다' };
  const invalid = validate(state, actor, action);
  if (invalid) return { state, error: invalid };
  const s = clone(state);
  if (s.pending.length) {
    if (action.type !== 'respond') return { state, error: '먼저 대기 중인 결정을 처리해야 합니다' };
    if (s.pending[0].player !== actor) return { state, error: '내 결정 차례가 아닙니다' };
    const err = respond(s, action.choice);
    if (err) return { state, error: err };
    runSteps(s);
    return { state: s };
  }
  if (action.type === 'respond') return { state, error: '대기 중인 결정 없음' };
  if (actor !== s.current) return { state, error: '내 차례가 아닙니다' };
  const p = s.players[actor];
  let err: string | null = null;
  switch (action.type) {
    case 'raid':
    case 'declareConflict':
    case 'pullTrack':
      if (s.phase !== 'external') return { state, error: '대외 단계가 지났습니다' };
      err =
        action.type === 'raid'
          ? raid(s, p, action.target, action.effect, !!action.swarm)
          : action.type === 'declareConflict'
            ? declareConflict(s, p, action.target, action.loss)
            : pullTrack(s, p);
      if (!err) s.phase = 'actions';
      break;
    case 'endTurn':
      endTurn(s);
      break;
    default:
      err = applyMainAction(s, p, action);
      if (!err) s.phase = 'actions';
  }
  if (err) return { state, error: err };
  runSteps(s);
  return { state: s };
}

const isInt = (n: unknown, min: number, max: number) => Number.isInteger(n) && (n as number) >= min && (n as number) <= max;
const RAID_EFFECTS = ['lootProd', 'lootFood', 'stealSci', 'stealEnergy', 'abduct'];
const CONFLICT_LOSSES = ['culture', 'building', 'doctrine'];

/** 온라인 입력을 포함해 행동 값의 모양을 먼저 검사한다 */
function validate(state: GameState, actor: number, a: Action): string | null {
  if (!a || typeof a !== 'object' || !isInt(actor, 0, state.players.length - 1)) return '잘못된 행동';
  const last = state.players.length - 1;
  switch (a.type) {
    case 'research':
      return typeof a.node === 'string' ? null : '잘못된 노드';
    case 'takeCard':
      return isInt(a.slot, 0, CARD_ROW_SIZE - 1) ? null : '잘못된 칸';
    case 'useSupply':
      return isInt(a.index, 0, 99) ? null : '잘못된 카드';
    case 'build':
      return BUILDING_KINDS.includes(a.kind) && isInt(a.level, 0, 3) ? null : '잘못된 건물';
    case 'upgrade':
      return BUILDING_KINDS.includes(a.kind) && isInt(a.from, 0, 3) && isInt(a.to, 0, 3) ? null : '잘못된 건물';
    case 'buildUnit':
      return UNIT_KINDS.includes(a.kind) && isInt(a.level, 0, 3) ? null : '잘못된 유닛';
    case 'upgradeUnit':
      return UNIT_KINDS.includes(a.kind) && isInt(a.from, 0, 3) && isInt(a.to, 0, 3) ? null : '잘못된 유닛';
    case 'disband': {
      const okKind = a.group === 'building' ? BUILDING_KINDS.includes(a.kind as never) : a.group === 'unit' ? UNIT_KINDS.includes(a.kind as never) : false;
      return okKind && isInt(a.level, 0, 3) ? null : '잘못된 대상';
    }
    case 'launch':
      return isInt(a.slot, 0, 2) && (a.replace === undefined || isInt(a.replace, 0, 1)) ? null : '잘못된 위성';
    case 'charter':
      return CHARTER_FIELDS.includes(a.field) ? null : '잘못된 헌장';
    case 'doQuest':
      return isInt(a.slot, 0, 1) && isInt(a.option, 0, 9) ? null : '잘못된 퀘스트';
    case 'raid':
      return isInt(a.target, 0, last) && RAID_EFFECTS.includes(a.effect) ? null : '잘못된 습격';
    case 'declareConflict':
      return isInt(a.target, 0, last) && CONFLICT_LOSSES.includes(a.loss) ? null : '잘못된 분쟁';
    case 'respond':
      return isInt(a.choice, 0, 99) ? null : '잘못된 선택';
    case 'addColonist':
    case 'legacyStage':
    case 'pullTrack':
    case 'endTurn':
      return null;
    default:
      return '알 수 없는 행동';
  }
}

/** 대기 결정이 없는 동안 큐에 쌓인 엔진 단계를 순서대로 처리한다 */
export function runSteps(state: GameState): void {
  let guard = 0;
  while (!state.pending.length && state.steps.length && !state.gameOver && guard++ < 1000) {
    const step = state.steps.shift()!;
    switch (step.k) {
      case 'threat':
        startThreatOn(state, step.questId, step.pid, step.redirect, step.exclude);
        break;
      case 'eraRest':
        advanceEraRest(state, step.old);
        break;
      case 'next':
        nextTurn(state);
        break;
      case 'start':
        startTurn(state);
        break;
    }
  }
}

/** 차례 시작: 카드 줄 정리 → 분쟁 판정 → 대외 단계 */
export function startTurn(state: GameState, first = false): void {
  const p = state.players[state.current];
  p.commandUsed = 0;
  p.defenseUsed = 0;
  p.guard = 0;
  for (const h of p.hand) h.fresh = false;
  if (!first && state.round > 1) cleanCardRow(state);
  resolveConflict(state, p);
  state.phase = 'external';
}

function cleanCardRow(state: GameState): void {
  const n = ROW_DISCARD[state.players.length] ?? 1;
  const row = state.cardRow;
  const ring = Math.min(state.era, 3) as 1 | 2 | 3;
  for (let i = 0; i < n && i < row.length; i++) {
    if (row[i]) state.cardDiscard[ring].push(row[i]!);
    row[i] = null;
  }
  const rest = row.filter((c): c is string => !!c);
  refillDeck(state, ring, CARD_ROW_SIZE - rest.length);
  const deck = state.cardDecks[ring];
  while (rest.length < CARD_ROW_SIZE && deck.length) rest.push(deck.shift()!);
  state.cardRow = [...rest, ...Array(CARD_ROW_SIZE - rest.length).fill(null)];
}

/** 덱이 모자라면 버린 카드 더미를 섞어 덱 아래에 붙인다 */
function refillDeck(state: GameState, ring: 1 | 2 | 3, need: number): void {
  if (state.cardDecks[ring].length >= need || !state.cardDiscard[ring].length) return;
  const pile = state.cardDiscard[ring];
  state.cardDiscard[ring] = [];
  state.cardDecks[ring].push(...withRng(state, (rng) => rng.shuffle(pile)));
  log(state, null, '카드 줄 덱이 바닥나 버린 카드를 섞었습니다');
}

export function produce(state: GameState, p: PlayerState): void {
  const mods = playerMods(p);
  const pv = productionPreview(p, mods);
  if (pv.stopped.length) log(state, p.id, `안정도 부족으로 건물 ${pv.stopped.length}곳 멈춤`);
  for (const k of ['prod', 'energy', 'sci', 'culture'] as const) p.res[k] += pv.gross[k];
  const food = p.res.food + pv.gross.food - pv.upkeep;
  if (food < 0) {
    const lost = -food * FAMINE_CULTURE;
    p.res.culture = Math.max(0, p.res.culture - lost);
    log(state, p.id, `식량 부족: 문화 −${lost}`);
    p.res.food = 0;
  } else p.res.food = food;
}

function checkMissions(state: GameState, p: PlayerState): void {
  for (const id of [...p.missions]) {
    const m = MISSION_DEFS[id];
    if (m && meets(state, p, m.cond)) {
      p.missions = p.missions.filter((x) => x !== id);
      p.missionsDone.push(id);
      for (const d of DOCTRINES) addDoctrine(state, p, d, m.doctrine?.[d] ?? 0);
      log(state, p.id, `임무 「${m.name}」 달성`);
    }
  }
}

/** 차례 끝: 생산 → 임무 → 궤도 정리·방위 태세 → 시대 전환 검사 → (대기 결정 뒤) 다음 차례 */
export function endTurn(state: GameState): void {
  const p = state.players[state.current];
  produce(state, p);
  p.coexist = 0;
  checkMissions(state, p);
  for (const o of p.orbit) o.timer--;
  const fallen = p.orbit.filter((o) => o.timer <= 0);
  for (const o of fallen) log(state, p.id, `위성 「${SATELLITE_DEFS[o.id].name}」 수명 다함`);
  p.orbit = p.orbit.filter((o) => o.timer > 0);
  p.guard = Math.min(GUARD_MAX, Math.max(0, defenseLeft(p)));
  const roundEnd = (state.current + 1) % state.players.length === state.startPlayer;
  state.steps.push({ k: 'next' });
  if (eraShouldAdvance(state, roundEnd)) advanceEraStart(state);
}

/** 다음 차례로: 라운드가 끝나면 종료 검사 → 라운드 시작 트랙 진행 → (대기 결정 뒤) 차례 시작 */
function nextTurn(state: GameState): void {
  const next = (state.current + 1) % state.players.length;
  state.current = next;
  if (next === state.startPlayer) {
    if (state.endTriggered || state.round >= ROUND_LIMIT) {
      finish(state);
      return;
    }
    state.round++;
  }
  state.steps.unshift({ k: 'start' });
  if (next === state.startPlayer) advanceTrack(state, state.startPlayer);
}

function finish(state: GameState): void {
  state.gameOver = true;
  state.phase = 'actions';
  const r = ranking(state);
  log(state, null, `게임 종료 — 우승 ${state.players[r[0].player].name} (${r[0].total}점)`);
}
