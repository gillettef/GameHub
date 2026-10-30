// 퀘스트 트랙: 진행, 종류별 처리, 대기 응답, 후원 계약 (Rules.md 12·13절)
import type { GameState, PlayerState, QuestOption, ThreatQuest } from '../types';
import { COEXIST_FOOD, COEXIST_SYMBIONT, DOCTRINE_NAMES, PATRON_FAIL_CULTURE, PATRON_LIMIT, PATRON_MET_CULTURE_PER_ERA } from '../data/constants';
import { QUEST_DEFS } from '../data/quests';
import { PATRON_DEFS } from '../data/patrons';
import { defenseValue, mainDoctrine, meets, metric, stage } from './derive';
import { addDoctrine, applyLoss } from './effects';
import { gain, log } from './util';

/** 진행을 일으킨 플레이어부터 자리 순 */
export function orderFrom(state: GameState, start: number): number[] {
  const n = state.players.length;
  return Array.from({ length: n }, (_, i) => (start + i) % n);
}

export function applyOption(state: GameState, p: PlayerState, o: QuestOption): void {
  addDoctrine(state, p, o.doctrine, o.points);
  gain(p.res, o.gain);
}

/** 결실 퀘스트가 칸 1(임박)에 처음 들어오면 종료 예고 */
function checkEndTrigger(state: GameState): void {
  if (state.endTriggered) return;
  {
    const id = state.questSlots[0];
    if (id && QUEST_DEFS[id]?.kind === 'fruition') {
      state.endTriggered = true;
      log(state, null, `「${QUEST_DEFS[id].name}」 공개 — 이번 라운드를 마치면 게임이 끝납니다`);
      return;
    }
  }
}

export function fillSlots(state: GameState): void {
  for (let i = 0; i < state.questSlots.length; i++) {
    if (!state.questSlots[i] && state.questFuture.length) state.questSlots[i] = state.questFuture.shift()!;
  }
  checkEndTrigger(state);
}

/** 트랙 1칸 진행: 칸 1 처리 → 칸 2 를 칸 1로 → 미래 더미에서 칸 2 공개 */
export function advanceTrack(state: GameState, trigger: number): void {
  const front = state.questSlots[0];
  state.questSlots[0] = null;
  if (front) processQuest(state, front, trigger);
  state.questSlots[0] = state.questSlots[1];
  state.questSlots[1] = state.questFuture.shift() ?? null;
  checkEndTrigger(state);
}

export function processQuest(state: GameState, id: string, trigger: number): void {
  const q = QUEST_DEFS[id];
  if (!q) return;
  switch (q.kind) {
    case 'judge': {
      log(state, null, `판정 「${q.name}」`);
      for (const pid of orderFrom(state, trigger)) {
        const p = state.players[pid];
        if (meets(state, p, q.cond)) state.pending.push({ kind: 'questReward', player: pid, questId: id });
        else if (q.failLoss) {
          applyLoss(state, p, q.failLoss);
          log(state, pid, `「${q.name}」 조건 미달 손실`);
        }
      }
      break;
    }
    case 'threat':
      processThreat(state, q, trigger);
      break;
    case 'contest':
      log(state, null, `경쟁 「${q.name}」 — 수행한 사람 없이 사라짐`);
      break;
    case 'patron':
      offerPatron(state, q.era, trigger, q.name);
      break;
    case 'fruition':
    case 'finale':
      break;
  }
}

function threatTargets(state: GameState, q: ThreatQuest, trigger: number): number[] {
  const order = orderFrom(state, trigger);
  const byDefense = [...order].sort((a, b) => defenseValue(state.players[a]) - defenseValue(state.players[b]));
  switch (q.target) {
    case 'all':
      return order;
    case 'weakest':
      return byDefense.slice(0, 1);
    case 'weakest2':
      return byDefense.slice(0, Math.min(2, order.length));
    case 'energyMost': {
      const best = [...order].sort((a, b) => state.players[b].res.energy - state.players[a].res.energy);
      return best.slice(0, 1);
    }
    default: {
      const d = q.target;
      const hit = order.filter((pid) => mainDoctrine(state.players[pid]) === d);
      return hit.length ? hit : byDefense.slice(0, 1);
    }
  }
}

/** 위협 대상마다 처리 단계를 자리 순으로 큐 맨 앞에 넣는다(대기 결정과 순서를 지키기 위해) */
function processThreat(state: GameState, q: ThreatQuest, trigger: number): void {
  log(state, null, `토착 생물 위협 「${q.name}」(위협도 ${q.power})`);
  const targets = threatTargets(state, q, trigger);
  state.steps.unshift(...targets.map((pid) => ({ k: 'threat' as const, questId: q.id, pid, redirect: true, exclude: targets })));
}

/** 대상 1명에 대한 위협 처리. 유도 가능하면 먼저 묻는다(이번 위협의 다른 대상에게는 넘길 수 없음) */
export function startThreatOn(state: GameState, questId: string, pid: number, allowRedirect: boolean, exclude: number[] = [], front = false): void {
  const p = state.players[pid];
  const targets = state.players.map((x) => x.id).filter((x) => x !== pid && !exclude.includes(x));
  if (allowRedirect && stage(p, 'symbiont') >= 2 && p.doctrine.symbiont >= 1 && targets.length > 0) {
    const item = { kind: 'redirect' as const, player: pid, questId, targets };
    if (front) state.pending.unshift(item);
    else state.pending.push(item);
    return;
  }
  resolveThreatOn(state, questId, pid, front);
}

function resolveThreatOn(state: GameState, questId: string, pid: number, front: boolean): void {
  const q = QUEST_DEFS[questId] as ThreatQuest;
  const p = state.players[pid];
  if (defenseValue(p) >= q.power) {
    if (mainDoctrine(p) === 'symbiont') {
      const item = { kind: 'coexist' as const, player: pid, questId };
      if (front) state.pending.unshift(item);
      else state.pending.push(item);
      return;
    }
    slay(state, p, q);
  } else {
    applyLoss(state, p, q.loss);
    log(state, pid, `「${q.name}」을 막지 못함`);
  }
}

function slay(state: GameState, p: PlayerState, q: ThreatQuest): void {
  gain(p.res, q.reward);
  const main = mainDoctrine(p);
  if (main === 'ark' || main === 'synth') addDoctrine(state, p, main, 1);
  log(state, p.id, `「${q.name}」 처치`);
}

function coexist(state: GameState, p: PlayerState, q: ThreatQuest): void {
  const mult = stage(p, 'symbiont') >= 3 ? 2 : 1;
  p.coexist += 1;
  addDoctrine(state, p, 'symbiont', COEXIST_SYMBIONT * mult);
  p.res.food += COEXIST_FOOD * mult;
  log(state, p.id, `「${q.name}」과 공존`);
}

function offerPatron(state: GameState, era: number, trigger: number, questName: string): void {
  const deck = state.patronDecks[era as 1 | 2 | 3];
  const patronId = deck.shift();
  if (!patronId) {
    log(state, null, `「${questName}」 — 남은 후원 계약 없음`);
    return;
  }
  const def = PATRON_DEFS[patronId];
  const order = orderFrom(state, trigger);
  const queue = [...order].sort((a, b) => metric(state, state.players[b], def.metric) - metric(state, state.players[a], def.metric));
  log(state, null, `후원 제안 「${def.name}」`);
  const [first, ...rest] = queue;
  state.pending.push({ kind: 'patron', player: first, patronId, queue: rest });
}

/** 대기 중인 결정의 선택지 수(응답 검증용) */
export function pendingChoices(state: GameState): number {
  const pd = state.pending[0];
  if (!pd) return 0;
  switch (pd.kind) {
    case 'questReward': {
      const q = QUEST_DEFS[pd.questId];
      return q.kind === 'judge' || q.kind === 'contest' ? q.options.length : 0;
    }
    case 'redirect':
      return pd.targets.length + 1;
    case 'coexist':
      return 2;
    case 'patron':
      return 2 + state.players[pd.player].patrons.length;
  }
}

/** 대기 결정에 응답. 오류면 문자열 */
export function respond(state: GameState, choice: number): string | null {
  const pd = state.pending[0];
  if (!pd) return '대기 중인 결정 없음';
  if (!Number.isInteger(choice) || choice < 0 || choice >= pendingChoices(state)) return '잘못된 선택';
  if (pd.kind === 'patron' && choice === 1 && state.players[pd.player].patrons.length >= PATRON_LIMIT) return '후원 계약 한도 — 해지할 계약을 고르세요';
  if (pd.kind === 'patron' && choice >= 2 && state.players[pd.player].patrons.length < PATRON_LIMIT) return '한도가 남아 있어 해지할 필요가 없습니다';
  state.pending.shift();
  const p = state.players[pd.player];
  switch (pd.kind) {
    case 'questReward': {
      const q = QUEST_DEFS[pd.questId];
      if (q.kind === 'judge' || q.kind === 'contest') {
        applyOption(state, p, q.options[choice]);
        log(state, p.id, `「${q.name}」 보상: ${DOCTRINE_NAMES[q.options[choice].doctrine]}`);
      }
      break;
    }
    case 'redirect': {
      if (choice === 0) resolveThreatOn(state, pd.questId, p.id, true);
      else {
        const target = pd.targets[choice - 1];
        addDoctrine(state, p, 'symbiont', -1);
        log(state, p.id, `위협을 ${state.players[target].name}에게 유도`);
        startThreatOn(state, pd.questId, target, false, [], true);
      }
      break;
    }
    case 'coexist': {
      const q = QUEST_DEFS[pd.questId] as ThreatQuest;
      if (choice === 1) coexist(state, p, q);
      else slay(state, p, q);
      break;
    }
    case 'patron': {
      const def = PATRON_DEFS[pd.patronId];
      if (choice === 0) {
        log(state, p.id, `후원 계약 「${def.name}」 거절`);
        const [next, ...rest] = pd.queue;
        if (next !== undefined) state.pending.unshift({ kind: 'patron', player: next, patronId: pd.patronId, queue: rest });
        else log(state, null, `「${def.name}」 — 모두 거절해 버림`);
      } else {
        if (choice >= 2) {
          const dropped = p.patrons.splice(choice - 2, 1)[0];
          log(state, p.id, `후원 계약 「${PATRON_DEFS[dropped].name}」 해지`);
        }
        p.patrons.push(pd.patronId);
        log(state, p.id, `후원 계약 「${def.name}」 체결`);
      }
      break;
    }
  }
  return null;
}

/** 후원 계약 요구 검사(시대 전환 때) */
export function checkPatronDemands(state: GameState, era: number): void {
  for (const p of state.players) {
    for (const id of p.patrons) {
      const def = PATRON_DEFS[id];
      if (metric(state, p, def.demand.metric) >= def.demand.min) {
        const gain = era * PATRON_MET_CULTURE_PER_ERA;
        p.res.culture += gain;
        log(state, p.id, `「${def.name}」 요구 충족: 문화 +${gain}`);
      } else {
        p.res.culture = Math.max(0, p.res.culture - PATRON_FAIL_CULTURE);
        log(state, p.id, `「${def.name}」 요구 미달: 문화 −${PATRON_FAIL_CULTURE}`);
      }
    }
  }
}

