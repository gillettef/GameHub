// 차례 진행과 행동 적용 진입점 (Rules.md 9절). (state, action) => { state, error? }
import type { Action, ActionResult, GameState, PlayerState } from '../types';
import { BUILDING_KINDS, CHARTER_FIELDS, UNIT_KINDS } from '../types';
import { FAMINE_CULTURE, GUARD_MAX, QUEST_ROW_SIZE, ROUND_LIMIT } from '../data/constants';
import { SATELLITE_DEFS } from '../data/satellites';
import { defenseLeft, playerMods, productionPreview, unhealthy } from './derive';
import { applyMainAction } from './actions';
import { declareConflict, raid, resolveConflict } from './external';
import { advanceEra, eraShouldAdvance } from './era';
import { canPickAny, checkPatronDemands, pickQuest, pushRow, respond, startThreatOn } from './quest';
import { ranking } from './scoring';
import { clone, log } from './util';

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
    s.ver++;
    return { state: s };
  }
  if (action.type === 'respond') return { state, error: '대기 중인 결정 없음' };
  if (actor !== s.current) return { state, error: '내 차례가 아닙니다' };
  const p = s.players[actor];
  let err: string | null = null;
  if (s.phase === 'quest' && action.type !== 'pickQuest') return { state, error: '먼저 퀘스트를 고르세요' };
  switch (action.type) {
    case 'pickQuest': {
      if (s.phase !== 'quest') return { state, error: '이번 차례에는 이미 퀘스트를 골랐습니다' };
      const r = pickQuest(s, p, action.slot);
      if (r === 'again') {
        if (!canPickAny(s, p)) afterQuest(s);
      } else if (r) err = r;
      // 위협 대상 단계(processThreat 가 넣은 것) 뒤에 온다
      else s.steps.push({ k: 'afterQuest' });
      break;
    }
    case 'raid':
    case 'declareConflict':
      if (s.phase !== 'external') return { state, error: '대외 단계가 지났습니다' };
      err = action.type === 'raid' ? raid(s, p, action.card, action.target, action.effect, !!action.swarm) : declareConflict(s, p, action.card, action.target);
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
  s.ver++;
  return { state: s };
}

const isInt = (n: unknown, min: number, max: number) => Number.isInteger(n) && (n as number) >= min && (n as number) <= max;
const RAID_EFFECTS = ['lootProd', 'lootFood', 'stealSci', 'stealEnergy', 'abduct'];

/** 온라인 입력을 포함해 행동 값의 모양을 먼저 검사한다 */
function validate(state: GameState, actor: number, a: Action): string | null {
  if (!a || typeof a !== 'object' || !isInt(actor, 0, state.players.length - 1)) return '잘못된 행동';
  const last = state.players.length - 1;
  switch (a.type) {
    case 'research':
      return typeof a.node === 'string' ? null : '잘못된 노드';
    case 'pickQuest':
      return isInt(a.slot, 0, QUEST_ROW_SIZE - 1) ? null : '잘못된 칸';
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
    case 'raid':
      return isInt(a.card, 0, 99) && isInt(a.target, 0, last) && RAID_EFFECTS.includes(a.effect) ? null : '잘못된 습격';
    case 'declareConflict':
      return isInt(a.card, 0, 99) && isInt(a.target, 0, last) ? null : '잘못된 분쟁';
    case 'respond':
      return isInt(a.choice, 0, 99) ? null : '잘못된 선택';
    case 'addColonist':
    case 'feast':
    case 'legacyStage':
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
      case 'afterQuest':
        afterQuest(state);
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

/** 차례 시작: 퀘스트 선택(고를 카드가 없으면 건너뜀) → 분쟁 판정 → 대외 단계 */
export function startTurn(state: GameState): void {
  const p = state.players[state.current];
  p.commandUsed = 0;
  p.feasted = false;
  p.defenseUsed = 0;
  p.guard = 0;
  for (const h of p.hand) h.fresh = false;
  state.turnFront = state.questRow[0] ?? null;
  state.phase = 'quest';
  if (!canPickAny(state, p)) afterQuest(state);
}

/** 퀘스트 처리와 그 결정이 끝난 뒤: 분쟁 판정 → 대외 단계 */
function afterQuest(state: GameState): void {
  resolveConflict(state, state.players[state.current]);
  state.phase = 'external';
}

export function produce(state: GameState, p: PlayerState): void {
  const mods = playerMods(p);
  const pv = productionPreview(p, mods);
  if (pv.plague) log(state, p.id, `역병: 불건강 정착민 ${unhealthy(p, mods)}명이 유휴 ${p.idle}명보다 많아 건물 생산이 멈춤`);
  for (const k of ['prod', 'energy', 'sci', 'culture'] as const) p.res[k] += pv.gross[k];
  const food = p.res.food + pv.gross.food - pv.upkeep;
  if (food < 0) {
    const lost = -food * FAMINE_CULTURE;
    p.res.culture = Math.max(0, p.res.culture - lost);
    log(state, p.id, `식량 부족: 문화 −${lost}`);
    p.res.food = 0;
  } else p.res.food = food;
}

/** 차례 끝: 생산 → 궤도 정리·방위 태세 → 시대 전환 검사 → (대기 결정 뒤) 다음 차례 */
export function endTurn(state: GameState): void {
  const p = state.players[state.current];
  produce(state, p);
  p.coexist = 0;
  for (const o of p.orbit) o.timer--;
  const fallen = p.orbit.filter((o) => o.timer <= 0);
  for (const o of fallen) log(state, p.id, `위성 「${SATELLITE_DEFS[o.id].name}」 수명 다함`);
  p.orbit = p.orbit.filter((o) => o.timer > 0);
  p.guard = Math.min(GUARD_MAX, Math.max(0, defenseLeft(p)));
  const roundEnd = (state.current + 1) % state.players.length === state.startPlayer;
  state.steps.push({ k: 'next' });
  pushRow(state);
  if (eraShouldAdvance(state, roundEnd)) advanceEra(state);
}

/** 다음 차례로: 라운드가 끝나면 종료 검사 → 차례 시작 */
function nextTurn(state: GameState): void {
  const next = (state.current + 1) % state.players.length;
  state.current = next;
  if (next === state.startPlayer) {
    if ((state.endTriggered && state.round >= (state.endRound ?? state.round)) || state.round >= ROUND_LIMIT) {
      finish(state);
      return;
    }
    state.round++;
  }
  state.steps.unshift({ k: 'start' });
}

function finish(state: GameState): void {
  // 종료 검사(Rules 13절): 가진 주둔지 요구를 마지막으로 한 번 더 본다(시대는 3으로 셈)
  log(state, null, '게임 종료 — 주둔지 요구 마지막 검사');
  checkPatronDemands(state, state.era, true);
  state.gameOver = true;
  state.phase = 'actions';
  const r = ranking(state);
  log(state, null, `게임 종료 — 우승 ${state.players[r[0].player].name} (${r[0].total}점)`);
}
