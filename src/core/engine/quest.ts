// 퀘스트 트랙: 퀘스트 선택, 종류별 처리, 대기 응답, 주둔지 (Rules.md 11~13절)
import type { CardDef, GameState, PlayerState, QuestOption, ThreatQuest } from '../types';
import { HAND_TYPES } from '../types';
import {
  COEXIST_FOOD,
  COEXIST_SYMBIONT,
  DOCTRINE_NAMES,
  PATRON_FAIL_CULTURE,
  PATRON_LIMIT,
  PATRON_MET_CULTURE_PER_ERA,
  QUEST_ROW_SIZE,
} from '../data/constants';
import { CARD_DEFS } from '../data/cards';
import { QUEST_DEFS, isEndCard, trackName } from '../data/quests';
import { PATRON_DEFS } from '../data/patrons';
import { commandMax, defenseValue, mainDoctrine, meets, metric, sight, stage } from './derive';
import { addDoctrine, applyLoss } from './effects';
import { canPay, gain, log } from './util';

/** 고른 플레이어부터 자리 순 */
export function orderFrom(state: GameState, start: number): number[] {
  const n = state.players.length;
  return Array.from({ length: n }, (_, i) => (start + i) % n);
}

export function applyOption(state: GameState, p: PlayerState, o: QuestOption): void {
  addDoctrine(state, p, o.doctrine, o.points);
  gain(p.res, o.gain);
}

/** 지금 덱 자리: 1~3시대는 그 시대 덱, 종료 시대는 종료 묶음 덱(4) */
export function deckKey(state: GameState): 1 | 2 | 3 | 4 {
  return state.era;
}

/** viewer 가 그 칸의 앞면을 아는지: 칸 1·뒤집힌 카드는 모두, 칸 2부터는 시야만큼 본인만 (Rules 12.1) */
export function slotVisible(state: GameState, viewer: number | null, slot: number): boolean {
  if (slot === 0 || state.questOpen[slot]) return true;
  if (viewer === null) return false;
  return slot <= sight(state.players[viewer]);
}

/** 후원자·유산·자원 팟을 가져올 수 없는 이유(Rules 11절) */
export function cardTakeBlock(state: GameState, p: PlayerState, c: CardDef): string | null {
  if (c.type === 'pioneer' && p.pioneerEras.includes(Math.min(state.era, 3))) return '이번 시대에 이미 후원자를 들였습니다';
  if (c.type === 'legacy' && p.legacyWip) return '이미 짓는 유산이 있습니다';
  if (HAND_TYPES.includes(c.type) && p.hand.length >= commandMax(state, p)) return '손패가 가득 찼습니다';
  return null;
}

/** 그 칸을 고를 수 없는 이유. 앞면을 모르는 칸은 늘 고를 수 있다 */
export function pickBlock(state: GameState, p: PlayerState, slot: number): string | null {
  const id = state.questRow[slot];
  if (!id) return '빈 칸입니다';
  if (!slotVisible(state, p.id, slot)) return null;
  if (isEndCard(id)) return '종료 묶음 카드는 고를 수 없습니다';
  const c = CARD_DEFS[id];
  return c ? cardTakeBlock(state, p, c) : null;
}

/** 이번 차례에 고를 수 있는 칸이 하나라도 있는지(없으면 퀘스트 선택을 건너뜀).
 *  플레이어가 아는 정보로만 판단한다 — 뒷면 칸은 종료 묶음이어도 고를 수 있는 칸으로 센다(가림 정보 누출 방지) */
export function canPickAny(state: GameState, p: PlayerState): boolean {
  return state.questRow.some((_, slot) => !pickBlock(state, p, slot));
}

/** 종료 묶음 카드가 칸 1에 처음 들어오면 종료 예고 (Rules 12.6) */
function checkEndTrigger(state: GameState): void {
  if (state.endTriggered) return;
  const id = state.questRow[0];
  if (id && isEndCard(id)) {
    state.endTriggered = true;
    log(state, null, `「${QUEST_DEFS[id].name}」 공개 — 이번 라운드를 마치면 게임이 끝납니다`);
  }
}

/** 덱에서 빈 칸을 뒤에서부터 채운다 */
export function refillRow(state: GameState): void {
  const deck = state.questDecks[deckKey(state)];
  while (state.questRow.length < QUEST_ROW_SIZE && deck.length) {
    state.questRow.push(deck.shift()!);
    state.questOpen.push(false);
  }
  checkEndTrigger(state);
}

/** 퀘스트 선택(Rules 12.2). 뒷면 종료 묶음이면 뒤집어 두고 다시 고르게 한다 → 'again' */
export function pickQuest(state: GameState, p: PlayerState, slot: number): string | 'again' | null {
  const err = pickBlock(state, p, slot);
  if (err) return err;
  const id = state.questRow[slot];
  if (isEndCard(id)) {
    state.questOpen[slot] = true;
    log(state, p.id, `뒷면 카드 「${QUEST_DEFS[id].name}」 — 종료 묶음이라 다시 고릅니다`);
    return 'again';
  }
  const blind = !slotVisible(state, p.id, slot);
  // 모두가 앞면을 본 칸(칸 1·뒤집힌 칸)인지. 아니면 뒷면에서 손패로 가져간 카드는 다른 사람에게 공개하지 않는다(Rules 12.2)
  const open = slot === 0 || state.questOpen[slot];
  const c = CARD_DEFS[id];
  const secret = !open && !!c && HAND_TYPES.includes(c.type) && !cardTakeBlock(state, p, c);
  state.questRow.splice(slot, 1);
  state.questOpen.splice(slot, 1);
  refillRow(state);
  if (secret) log(state, p.id, `퀘스트 「${trackName(id)}」 선택(뒷면, 비공개)`, '뒷면 퀘스트 선택 — 손패로 가져감(비공개)');
  else log(state, p.id, `퀘스트 「${trackName(id)}」 선택${blind ? '(뒷면)' : ''}`);
  resolvePick(state, p, id, secret);
  return null;
}

function resolvePick(state: GameState, p: PlayerState, id: string, secret: boolean): void {
  const c = CARD_DEFS[id];
  if (c) {
    takeCard(state, p, c, secret);
    return;
  }
  const q = QUEST_DEFS[id];
  if (!q) return;
  switch (q.kind) {
    case 'judge':
      if (meets(state, p, q.cond)) state.pending.push({ kind: 'questReward', player: p.id, questId: id });
      else if (q.failLoss) {
        applyLoss(state, p, q.failLoss);
        log(state, p.id, `「${q.name}」 조건 미달 손실`);
      } else log(state, p.id, `「${q.name}」 조건 미달`);
      break;
    case 'contest':
      if (meets(state, p, q.cond) && canPay(p.res, q.cost)) {
        gain(p.res, q.cost, -1);
        if (q.facility && !p.facilities.includes(q.facility)) p.facilities.push(q.facility);
        log(state, p.id, `경쟁 퀘스트 「${q.name}」 수행`);
        state.pending.push({ kind: 'questReward', player: p.id, questId: id });
      } else log(state, p.id, `「${q.name}」 수행 못함 — 버림`);
      break;
    case 'threat':
      processThreat(state, q, p.id);
      break;
    case 'patron':
      offerPatron(state, q.era, p.id, q.name);
      break;
    case 'fruition':
    case 'finale':
      break;
  }
}

function takeCard(state: GameState, p: PlayerState, c: CardDef, secret = false): void {
  const block = cardTakeBlock(state, p, c);
  if (block) {
    log(state, p.id, `「${c.name}」 가져올 수 없음(${block}) — 버림`);
    return;
  }
  if (c.type === 'pioneer') {
    p.pioneer = c.id;
    p.pioneerEras.push(Math.min(state.era, 3)); // 종료 시대는 3시대로 친다(Rules 17)
    log(state, p.id, `후원자 「${c.name}」 영입`);
  } else if (c.type === 'legacy') {
    p.legacyWip = { id: c.id, done: 0 };
    log(state, p.id, `유산 「${c.name}」 착공`);
  } else {
    p.hand.push({ id: c.id, fresh: true });
    const text = `${c.type === 'supply' ? '자원 팟' : c.type === 'raid' ? '습격' : '분쟁'} 「${c.name}」 획득`;
    if (secret) log(state, p.id, text, '손패 1장 획득(비공개)');
    else log(state, p.id, text);
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
    log(state, null, `「${questName}」 — 남은 주둔지 없음`);
    return;
  }
  const def = PATRON_DEFS[patronId];
  // 가린 상태(AI 의 한 수 시험)에서는 덱 맨 위를 모른다
  if (!def) return;
  const order = orderFrom(state, trigger);
  const queue = [...order].sort((a, b) => metric(state, state.players[b], def.metric) - metric(state, state.players[a], def.metric));
  log(state, null, `주둔지 제안 「${def.name}」`);
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
  if (pd.kind === 'patron' && choice === 1 && state.players[pd.player].patrons.length >= PATRON_LIMIT) return '주둔지 한도 — 철수시킬 주둔지를 고르세요';
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
        log(state, p.id, `주둔지 「${def.name}」 거절`);
        const [next, ...rest] = pd.queue;
        if (next !== undefined) state.pending.unshift({ kind: 'patron', player: next, patronId: pd.patronId, queue: rest });
        else log(state, null, `「${def.name}」 — 모두 거절해 버림`);
      } else {
        if (choice >= 2) {
          const dropped = p.patrons.splice(choice - 2, 1)[0];
          log(state, p.id, `주둔지 「${PATRON_DEFS[dropped].name}」 철수`);
        }
        p.patrons.push(pd.patronId);
        log(state, p.id, `주둔지 「${def.name}」 받음`);
      }
      break;
    }
  }
  return null;
}

/** 주둔지 요구 검사(시대 전환 때) */
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

