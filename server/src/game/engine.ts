// 게임 진행 규칙 출처: notes/기획_정리.md (2026-09-28 정리본)
// 문서에 명시되지 않아 임의로 정한 부분은 "ASSUMPTION" 주석으로 표시했습니다.
import {
  createClassDeck,
  createCreatureDeck,
  createExplorationPile,
  createGrimoirePile,
  createLabPile,
  drawFromPile,
  peekPile,
} from "./cards.js";
import { randomUUID } from "node:crypto";
import { BALANCE, examCreditForRank } from "./config.js";
import { describeAbility } from "./creatures.js";
import { describeEffect } from "./explorationCards.js";
import {
  effectiveStat,
  type ActivityId,
  type CardEffect,
  type CreatureAbility,
  type CreatureCard,
  type LabCard,
  type StatKey,
  type ExamResult,
  type GameState,
  type PlayerGameState,
} from "./types.js";

const ACTIVITY_IDS: ActivityId[] = ["tournament", "creature", "duel", "exploration", "lab"];

function rollD6(): number {
  return 1 + Math.floor(Math.random() * 6);
}

function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// 동점 처리 공통 규칙: 매력이 높은 쪽 우선, 매력도 같으면 주사위(무작위)로 결정
function compareTieBreak(state: GameState, aId: string, bId: string): number {
  const charmDiff = effectiveStat(state.players[bId], "charm") - effectiveStat(state.players[aId], "charm");
  return charmDiff !== 0 ? charmDiff : Math.random() < 0.5 ? -1 : 1;
}

// 3주차(자율활동) 구역 선택 순서: 현재 매력이 높은 순 (동점이면 주사위). 2주차 수업카드로 바뀐 매력이 반영된다
function orderByCharm(state: GameState): string[] {
  return state.turnOrder
    .map((id) => ({ id, charm: effectiveStat(state.players[id], "charm"), roll: Math.random() }))
    .sort((a, b) => b.charm - a.charm || b.roll - a.roll)
    .map((entry) => entry.id);
}

// 성장 점수: 영구 능력치 합 + 학점 × 3. 선두와의 격차가 크면 탐험에서 역전 보너스를 받는다
function growthScore(player: PlayerGameState): number {
  return player.intelligence + player.stamina + player.charm + player.spellPower + player.credit * 3;
}

// 선두와의 성장 점수 격차 (선두 본인은 0)
export function growthGap(state: GameState, playerId: string): number {
  const best = Math.max(...state.turnOrder.map((id) => growthScore(state.players[id])));
  return best - growthScore(state.players[playerId]);
}

// 마법생물 유형 점수 (세븐원더스의 과학 카드 방식): 같은 속성이 늘수록 제곱으로 커지고, 세 속성을 고루 모으면 세트 보너스.
// 학점은 이 점수를 나눈 몫이며, 새 카드를 얻을 때 늘어난 만큼 즉시 받는다.
function creatureCollectionCredit(creatures: CreatureCard[]): number {
  const counts = { sky: 0, land: 0, ocean: 0 };
  for (const c of creatures) counts[c.element] += 1;
  const values = Object.values(counts);
  const score = values.reduce((sum, n) => sum + n * n, 0) + BALANCE.creatureSetBonus * Math.min(...values);
  return Math.floor(score / BALANCE.creatureScoreDivisor);
}

// 플레이어가 가진 마법생물 중 해당 트리거의 능력만 모은다
function abilitiesOf(player: PlayerGameState, trigger: CreatureAbility["trigger"]): CreatureAbility[] {
  const abilities = [
    ...player.creatures.map((c) => c.ability),
    ...player.grimoires.flatMap((g) => (g.ability ? [g.ability] : [])),
  ];
  return abilities.filter((a) => a.trigger === trigger);
}

function sumEffect(abilities: CreatureAbility[], effect: CreatureAbility["effect"]): number {
  return abilities.filter((a) => a.effect === effect).reduce((sum, a) => sum + a.amount, 0);
}

function drawCreature(state: GameState) {
  if (state.creatureDeck.length === 0) {
    state.creatureDeck = shuffle(state.creatureDiscard);
    state.creatureDiscard = [];
  }
  return state.creatureDeck.pop();
}

function drawClassCards(state: GameState, count: number) {
  const drawn = [];
  for (let i = 0; i < count; i++) {
    if (state.classDeck.length === 0) {
      state.classDeck = shuffle(state.classDiscard);
      state.classDiscard = [];
    }
    const card = state.classDeck.pop();
    if (!card) break; // 덱과 버림 더미가 모두 비면 더 뽑지 못함
    drawn.push(card);
  }
  return drawn;
}

// 탐험 카드/연구 카드 효과를 플레이어에게 적용한다
function applyCardEffect(state: GameState, player: PlayerGameState, effect: CardEffect): void {
  for (const [stat, amount] of Object.entries(effect.stats ?? {})) player[stat as StatKey] += amount;
  for (const [stat, amount] of Object.entries(effect.tempStats ?? {})) {
    player.tempBoosts[stat as StatKey] = (player.tempBoosts[stat as StatKey] ?? 0) + amount;
  }
  player.credit += effect.credit ?? 0;
  player.pendingSpellbookTokens += effect.nextSpellbook ?? 0;
  player.pendingStaminaTokens += effect.nextStamina ?? 0;
  if (effect.peekExploration) {
    const top = peekPile(state.explorationPile);
    player.peekedExploration = top
      ? {
          id: top.id,
          name: top.name,
          description: top.description,
          checkText: top.check ? `${STAT_NAME[top.check.stat]} 판정 (주사위 + ${STAT_NAME[top.check.stat]} ≥ ${top.check.target})` : undefined,
          successText: describeEffect(top.success),
          failureText: describeEffect(top.failure),
        }
      : null;
  }
}

const STAT_NAME: Record<StatKey, string> = { intelligence: "지력", stamina: "체력", charm: "매력", spellPower: "주문력" };

function log(state: GameState, message: string): void {
  state.log.push({ round: state.round, message });
}

function createPlayer(id: string, name: string, isBot = false): PlayerGameState {
  return {
    id,
    name,
    isBot,
    ...BALANCE.initialStats,
    credit: BALANCE.initialCredit,
    tempBoosts: {},
    staminaTokens: 0,
    spellbookTokens: 0,
    pendingStaminaTokens: 0,
    pendingSpellbookTokens: 0,
    peekedExploration: null,
    tournamentTrack: 0,
    classCards: [],
    creatures: [],
    equipment: [],
    grimoires: [],
    offeredClassCards: [],
    hasActedThisPhase: false,
  };
}

export function createGame(players: { id: string; name: string; isBot?: boolean }[]): GameState {
  // ASSUMPTION: 선 플레이어는 무작위로 정하고(문서상 "무작위 또는 협의"), 좌석 순서(시계방향)는 참가 순서를 그대로 사용한다.
  const turnOrder = shuffle(players.map((p) => p.id));
  const state: GameState = {
    round: 1,
    phase: "prep",
    turnOrder,
    startingPlayerIndex: 0,
    players: Object.fromEntries(
      players.map((p) => [p.id, createPlayer(p.id, p.name, p.isBot)]),
    ),
    activitySlots: { tournament: null, creature: null, duel: null, exploration: null, lab: null },
    activityOrder: [],
    activityTurnPointer: 0,
    duelTargetId: null,
    pendingLab: null,
    examResults: [],
    cleanupSummary: [],
    labPile: createLabPile(),
    explorationPile: createExplorationPile(),
    grimoirePile: createGrimoirePile(),
    classDeck: createClassDeck(randomUUID),
    classDiscard: [],
    creatureDeck: createCreatureDeck(),
    creatureDiscard: [],
    log: [],
  };
  beginRound(state);
  return state;
}

function beginRound(state: GameState): void {
  log(state, `${state.round}라운드 시작`);
  for (const playerId of state.turnOrder) {
    const player = state.players[playerId];
    // 1주차(준비): 체력 수치만큼 체력토큰, 주문력 수치만큼 마법 주문서 획득
    const prepAbilities = abilitiesOf(player, "prep");
    player.staminaTokens = Math.max(
      0,
      effectiveStat(player, "stamina") + player.pendingStaminaTokens + sumEffect(prepAbilities, "stamina"),
    );
    player.pendingStaminaTokens = 0;
    player.spellbookTokens = Math.max(
      0,
      effectiveStat(player, "spellPower") + player.pendingSpellbookTokens + sumEffect(prepAbilities, "spellbook"),
    );
    player.pendingSpellbookTokens = 0;
  }
  beginClassPhase(state);
}

function beginClassPhase(state: GameState): void {
  state.phase = "class";
  for (const playerId of state.turnOrder) {
    const player = state.players[playerId];
    const drawCount = effectiveStat(player, "intelligence");
    player.offeredClassCards = drawClassCards(state, drawCount);
    player.hasActedThisPhase = false;
  }
  log(state, "2주차(정규수업): 수업카드 배분");
}

function allPlayersActed(state: GameState): boolean {
  return state.turnOrder.every((id) => state.players[id].hasActedThisPhase);
}

export function submitClassChoice(state: GameState, playerId: string, keepCardIds: string[]): void {
  if (state.phase !== "class") throw new Error("지금은 정규수업 단계가 아닙니다.");
  const player = state.players[playerId];
  if (!player) throw new Error("플레이어를 찾을 수 없습니다.");
  if (player.hasActedThisPhase) throw new Error("이미 수업 카드를 선택했습니다.");

  const offeredIds = new Set(player.offeredClassCards.map((c) => c.id));
  const uniqueKeepIds = [...new Set(keepCardIds)];
  if (!uniqueKeepIds.every((id) => offeredIds.has(id))) {
    throw new Error("제시된 수업카드 중에서만 선택할 수 있습니다.");
  }
  if (player.staminaTokens < uniqueKeepIds.length) {
    throw new Error("체력토큰이 부족합니다 (카드 1장당 체력토큰 1개 필요).");
  }

  const keptCards = player.offeredClassCards.filter((c) => uniqueKeepIds.includes(c.id));
  for (const card of keptCards) {
    player[card.statBoost.stat] += card.statBoost.amount;
    player.classCards.push(card);
  }
  player.staminaTokens -= uniqueKeepIds.length;
  // 고르지 않은 카드는 버림 더미로
  state.classDiscard.push(...player.offeredClassCards.filter((c) => !uniqueKeepIds.includes(c.id)));
  player.offeredClassCards = [];
  player.hasActedThisPhase = true;
  log(state, `${player.name}: 수업카드 ${keptCards.length}장 습득`);

  if (allPlayersActed(state)) {
    beginActivityPhase(state);
  }
}

function beginActivityPhase(state: GameState): void {
  state.phase = "activity";
  state.activitySlots = { tournament: null, creature: null, duel: null, exploration: null, lab: null };
  state.activityOrder = orderByCharm(state);
  state.startingPlayerIndex = state.turnOrder.indexOf(state.activityOrder[0]);
  state.activityTurnPointer = 0;
  state.duelTargetId = null;
  state.pendingLab = null;
  for (const playerId of state.turnOrder) {
    state.players[playerId].hasActedThisPhase = false;
  }
  log(state, `3주차(자율활동) 시작 — 매력 순서: ${state.activityOrder.map((id) => state.players[id].name).join(" → ")}`);
}

function resolveActivity(
  state: GameState,
  activityId: ActivityId,
  player: PlayerGameState,
  targetPlayerId: string | undefined,
  boost: number,
): void {
  switch (activityId) {
    case "tournament": {
      const gain = effectiveStat(player, "spellPower") + boost;
      player.tournamentTrack = Math.min(BALANCE.tournamentMaxTrack, player.tournamentTrack + gain);
      log(state, `${player.name}: 마법 토너먼트 참가 (트랙 ${player.tournamentTrack}칸)`);
      break;
    }
    case "creature": {
      const card = drawCreature(state);
      if (!card) {
        log(state, `${player.name}: 마법생물 덱이 비어 있습니다`);
        break;
      }
      // 체력토큰으로 집중하면 필요한 마법 주문서가 줄어든다 (최소 1개)
      const cost = Math.max(1, card.requiredSpellPower - boost);
      if (player.spellbookTokens >= cost) {
        player.spellbookTokens -= cost;
        const creditBefore = creatureCollectionCredit(player.creatures);
        player.creatures.push(card);
        const gain = card.ability.trigger === "acquire" && card.ability.effect === "spellPower" ? card.ability.amount : 0;
        player.spellPower += gain;
        // 유형 모으기 보너스: 새 카드로 늘어난 유형 점수만큼 학점을 즉시 받는다
        const collectionCredit = creatureCollectionCredit(player.creatures) - creditBefore;
        player.credit += collectionCredit;
        log(
          state,
          `${player.name}: 마법생물 "${card.name}" 획득 (${describeAbility(card.ability)})${collectionCredit > 0 ? ` — 유형 모으기 보너스 학점 +${collectionCredit}` : ""}`,
        );
      } else {
        state.creatureDiscard.push(card);
        log(state, `${player.name}: "${card.name}"(요구 주문서 ${card.requiredSpellPower}개)를 데려오지 못했습니다`);
      }
      break;
    }
    case "duel": {
      if (!targetPlayerId || !state.players[targetPlayerId] || targetPlayerId === player.id) {
        throw new Error("주문 대결 상대를 지정해야 합니다.");
      }
      const target = state.players[targetPlayerId];
      if (target.hasActedThisPhase) throw new Error("아직 자율활동을 고르지 않은 플레이어만 지목할 수 있습니다.");
      // 지목당한 플레이어는 이번 달 자율활동으로 주문 대결을 강제로 하게 된다 (자기 차례는 건너뜀)
      target.hasActedThisPhase = true;
      state.duelTargetId = target.id;
      // 지목당한 쪽은 남은 체력토큰이 있으면 자동으로 집중해 굴림 +1 (토큰은 어차피 4주차에 소멸)
      const defenderBoost = target.staminaTokens > 0 ? 1 : 0;
      target.staminaTokens -= defenderBoost;
      // 마법생물 능력: 참여 시(duel)는 양쪽, 도전받았을 때(defend)는 도전받은 쪽만 적용
      const challengerAbilities = abilitiesOf(player, "duel");
      const defenderAbilities = [...abilitiesOf(target, "duel"), ...abilitiesOf(target, "defend")];
      const challengerRoll = Math.max(
        0,
        rollD6() + boost + effectiveStat(player, "spellPower") + sumEffect(challengerAbilities, "rollBonus") - sumEffect(defenderAbilities, "enemyRollPenalty"),
      );
      const defenderRoll = Math.max(
        0,
        rollD6() + defenderBoost + effectiveStat(target, "spellPower") + sumEffect(defenderAbilities, "rollBonus") - sumEffect(challengerAbilities, "enemyRollPenalty"),
      );
      // 동점이면 매력이 높은 쪽, 매력도 같으면 도전받은 쪽(defender)이 승리 (주사위 재굴림 대신 기존 규칙 유지)
      const challengerWins =
        challengerRoll !== defenderRoll
          ? challengerRoll > defenderRoll
          : effectiveStat(player, "charm") > effectiveStat(target, "charm");
      const winner = challengerWins ? player : target;
      const loser = winner === player ? target : player;
      const loserAbilities = [...(loser === player ? challengerAbilities : defenderAbilities), ...abilitiesOf(loser, "lose")];
      // 체력토큰 효과는 다음 달 준비 때 반영
      player.pendingStaminaTokens += sumEffect(challengerAbilities, "stamina");
      target.pendingStaminaTokens += sumEffect(defenderAbilities, "stamina");
      target.pendingStaminaTokens -= sumEffect(challengerAbilities, "enemyStamina");
      player.pendingStaminaTokens -= sumEffect(defenderAbilities, "enemyStamina");
      loser.pendingStaminaTokens += sumEffect(abilitiesOf(loser, "lose"), "stamina");
      winner.pendingStaminaTokens -= sumEffect(abilitiesOf(loser, "lose"), "enemyStamina");
      const grimoire = drawFromPile(state.grimoirePile);
      if (grimoire) {
        winner.grimoires.push(grimoire);
        winner[grimoire.statBoost.stat] += grimoire.statBoost.amount;
      }
      // 강제로 지목당한 쪽은 져도 마법 주문서를 잃지 않는다
      if (loser !== target && loser.spellbookTokens > 0 && sumEffect(loserAbilities, "immune") === 0) {
        loser.spellbookTokens = Math.max(0, loser.spellbookTokens - BALANCE.duelLoserTokenLoss);
      }
      log(
        state,
        `${player.name}(${challengerRoll})이(가) ${target.name}(${defenderRoll}${defenderBoost ? ", 집중" : ""})을(를) 지목! ${winner.name} 승리${grimoire ? `, 마도서 "${grimoire.name}" 획득` : ""}`,
      );
      break;
    }
    case "exploration": {
      // 협력 없이 단독 처리로 확정 (2026-09-29)
      const card = drawFromPile(state.explorationPile);
      if (!card) break;
      // 이 카드를 엿보고 있던 플레이어의 정보는 낡은 것이 된다
      for (const p of Object.values(state.players)) if (p.peekedExploration?.id === card.id) p.peekedExploration = null;
      let success = true;
      let rollText = "";
      if (card.check) {
        const roll = rollD6();
        // 선두와의 격차가 크면 역전 보너스: 뒤처진 플레이어의 한 방을 돕는다
        const catchUp = growthGap(state, player.id) >= BALANCE.catchUpGap ? BALANCE.catchUpBonus : 0;
        const total = roll + boost + catchUp + effectiveStat(player, card.check.stat);
        success = total >= card.check.target;
        rollText = ` (판정 ${total}/${card.check.target}${catchUp ? `, 역전 보너스 +${catchUp}` : ""} ${success ? "성공" : "실패"})`;
      }
      const effect = success ? card.success : card.failure;
      applyCardEffect(state, player, effect);
      state.explorationPile.discard.push(card);
      log(state, `${player.name}: 비밀의 방 "${card.name}"${rollText} → ${describeEffect(effect)}`);
      break;
    }
    case "lab": {
      // 지력만큼 연구 카드를 펼치고(체력토큰으로 집중하면 1장 더), 그중 1장을 직접 고른다 (chooseLabCard)
      const candidates: LabCard[] = [];
      const count = Math.max(1, Math.min(BALANCE.labMaxCandidates, effectiveStat(player, "intelligence"))) + boost;
      for (let i = 0; i < count; i++) {
        const drawn = drawFromPile(state.labPile);
        if (!drawn) break;
        candidates.push(drawn);
      }
      if (candidates.length === 0) break;
      state.pendingLab = { playerId: player.id, cards: candidates };
      log(state, `${player.name}: 연구실 실험 — 연구 카드 ${candidates.length}장을 펼쳤어요`);
      break;
    }
  }
}

export function selectActivity(
  state: GameState,
  playerId: string,
  activityId: ActivityId,
  targetPlayerId?: string,
  useStamina = false,
): void {
  if (state.phase !== "activity") throw new Error("지금은 자율활동 단계가 아닙니다.");
  if (state.pendingLab) throw new Error("연구 카드를 먼저 골라야 합니다.");
  const currentTurnPlayerId = state.activityOrder[state.activityTurnPointer];
  if (currentTurnPlayerId !== playerId) throw new Error("당신의 차례가 아닙니다.");
  if (!ACTIVITY_IDS.includes(activityId)) throw new Error("존재하지 않는 활동입니다.");
  if (state.activitySlots[activityId] !== null) throw new Error("이미 다른 플레이어가 선택한 구역입니다.");

  const player = state.players[playerId];
  // 남은 체력토큰 1개를 써서 집중하면 활동마다 +1 효과 (토큰은 4주차에 소멸하므로 남겨도 쓸모없다)
  if (useStamina && player.staminaTokens < 1) throw new Error("집중에 쓸 체력토큰이 없습니다.");
  resolveActivity(state, activityId, player, targetPlayerId, useStamina ? 1 : 0);
  if (useStamina) player.staminaTokens -= 1;
  state.activitySlots[activityId] = playerId;
  player.hasActedThisPhase = true;
  // 연구실 실험은 카드를 고를 때까지 차례가 끝나지 않는다
  if (!state.pendingLab) finishActivityTurn(state);
}

// 남은 구역이 주문 대결뿐인데 지목할 상대(아직 활동을 고르지 않은 플레이어)도 없으면 고를 수 있는 활동이 없다
function hasNoAvailableActivity(state: GameState, playerId: string): boolean {
  const onlyDuelLeft = ACTIVITY_IDS.filter((a) => state.activitySlots[a] === null).every((a) => a === "duel");
  const hasTarget = state.turnOrder.some((id) => id !== playerId && !state.players[id].hasActedThisPhase);
  return onlyDuelLeft && !hasTarget;
}

// 다음 차례로 넘긴다. 주문 대결에 지목당해 이미 활동을 마친 플레이어는 건너뛰고,
// 고를 수 있는 활동이 없는 플레이어는 쉬어 가며 다음 달 체력토큰 +1을 받는다
function finishActivityTurn(state: GameState): void {
  state.activityTurnPointer += 1;
  while (state.activityTurnPointer < state.activityOrder.length) {
    const player = state.players[state.activityOrder[state.activityTurnPointer]];
    if (!player.hasActedThisPhase && hasNoAvailableActivity(state, player.id)) {
      player.hasActedThisPhase = true;
      player.pendingStaminaTokens += 1;
      log(state, `${player.name}: 고를 수 있는 구역이 없어 쉬어 갑니다 (다음 달 체력토큰 +1)`);
    }
    if (!player.hasActedThisPhase) break;
    state.activityTurnPointer += 1;
  }
  if (state.activityTurnPointer >= state.activityOrder.length) {
    beginCleanupPhase(state);
  }
}

// 연구실 실험: 펼쳐진 연구 카드 중 1장을 골라 효과를 받는다
export function chooseLabCard(state: GameState, playerId: string, cardId: string): void {
  const pending = state.pendingLab;
  if (!pending || pending.playerId !== playerId) throw new Error("지금은 연구 카드를 고를 수 없습니다.");
  const card = pending.cards.find((c) => c.id === cardId);
  if (!card) throw new Error("펼쳐진 연구 카드 중에서만 고를 수 있습니다.");
  const player = state.players[playerId];
  applyCardEffect(state, player, card.effect);
  // 시험 카드는 다음 시험까지 보관하고, 나머지는 효과를 받는 즉시 버림 더미로
  const rest = pending.cards.filter((c) => c.id !== card.id);
  state.labPile.discard.push(...rest);
  if (card.kind === "exam") player.equipment.push(card);
  else state.labPile.discard.push(card);
  state.pendingLab = null;
  log(state, `${player.name}: 연구 카드 "${card.name}" 선택 (${card.summary})`);
  finishActivityTurn(state);
}

function beginCleanupPhase(state: GameState): void {
  state.phase = "cleanup";
  state.cleanupSummary = state.turnOrder.map((id) => ({
    playerId: id,
    staminaTokens: state.players[id].staminaTokens,
    spellbookTokens: state.players[id].spellbookTokens,
  }));
  for (const playerId of state.turnOrder) {
    const player = state.players[playerId];
    player.staminaTokens = 0;
    player.spellbookTokens = 0;
    player.hasActedThisPhase = false;
  }
  log(state, "4주차(정리): 남은 토큰 소멸");

  if (state.round === BALANCE.midtermRound) {
    resolveExam(state, "midterm_exam");
  } else if (state.round === BALANCE.totalRounds) {
    resolveExam(state, "final_exam");
  } else {
    advanceRound(state);
  }
}

function advanceRound(state: GameState): void {
  state.round += 1;
  beginRound(state);
}

function resolveExam(state: GameState, examType: "midterm_exam" | "final_exam"): void {
  state.phase = examType;

  const scores = new Map(
    state.turnOrder.map((id) => [id, rollDicePool(effectiveStat(state.players[id], "intelligence"))]),
  );
  // 동점: 주문력 높은 쪽 → 매력 높은 쪽 → 주사위(무작위) 순으로 우선
  const ranked = state.turnOrder
    .map((id) => ({ playerId: id, score: scores.get(id) ?? 0 }))
    .sort(
      (x, y) =>
        y.score - x.score ||
        effectiveStat(state.players[y.playerId], "spellPower") - effectiveStat(state.players[x.playerId], "spellPower") ||
        compareTieBreak(state, x.playerId, y.playerId),
    );

  const result: ExamResult = { round: state.round, scores: [] };
  ranked.forEach((entry, index) => {
    const rank = index + 1;
    const creditAwarded = examCreditForRank(rank);
    state.players[entry.playerId].credit += creditAwarded;
    result.scores.push({ playerId: entry.playerId, score: entry.score, rank, creditAwarded });
  });
  state.examResults.push(result);
  log(state, `${examType === "midterm_exam" ? "중간고사" : "기말고사"} 결과 반영 (학점 지급 완료)`);

  // 연구실 실험으로 얻은 임시 능력치 증가분은 다음 시험까지 유지된 뒤 소멸
  for (const playerId of state.turnOrder) {
    const p = state.players[playerId];
    p.tempBoosts = {};
    // 효과가 끝난 시험 카드는 버림 더미로
    state.labPile.discard.push(...p.equipment);
    p.equipment = [];
  }

  if (examType === "final_exam") {
    applyTournamentFinalRewards(state);
    finalizeGame(state);
  } else {
    advanceRound(state);
  }
}

function rollDicePool(diceCount: number): number {
  let total = 0;
  for (let i = 0; i < Math.max(0, diceCount); i++) total += rollD6();
  return total;
}

function applyTournamentFinalRewards(state: GameState): void {
  // 트랙 위치가 높은 순, 동점이면 매력 → 주사위로 순위를 갈라 1위 +2, 2위 +1 (트랙 0칸은 제외)
  const ranked = [...state.turnOrder].sort(
    (a, b) =>
      state.players[b].tournamentTrack - state.players[a].tournamentTrack || compareTieBreak(state, a, b),
  );
  const rewards = BALANCE.tournamentRewards;
  ranked.slice(0, rewards.length).forEach((playerId, index) => {
    const player = state.players[playerId];
    if (player.tournamentTrack <= 0) return;
    player.credit += rewards[index];
    log(state, `${player.name}: 마법 토너먼트 ${index + 1}위 보상 학점 +${rewards[index]}`);
  });
}

function finalizeGame(state: GameState): void {
  state.phase = "ended";
  const achievements = state.turnOrder.map((id) => ({
    playerId: id,
    achievement: effectiveStat(state.players[id], "spellPower") * state.players[id].credit,
  }));
  // 성취도 동점이면 매력 → 주사위 순으로 단독 승자 결정
  achievements.sort(
    (a, b) => b.achievement - a.achievement || compareTieBreak(state, a.playerId, b.playerId),
  );
  state.winnerIds = [achievements[0].playerId];
  log(state, "게임 종료: 마법 성취도(주문력 × 학점) 최고 플레이어 승리");
}
