// 게임 진행 규칙 출처: notes/기획_정리.md (2026-09-28 정리본)
// 문서에 명시되지 않아 임의로 정한 부분은 "ASSUMPTION" 주석으로 표시했습니다.
import {
  createClassDeck,
  createCreatureDeck,
  createEquipmentPile,
  createExplorationPile,
  createGrimoirePile,
  drawFromPile,
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

function rotateFrom<T>(items: T[], startIndex: number): T[] {
  return [...items.slice(startIndex), ...items.slice(0, startIndex)];
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

// 탐험/장비 카드 효과를 플레이어에게 적용한다
function applyCardEffect(player: PlayerGameState, effect: CardEffect): void {
  for (const [stat, amount] of Object.entries(effect.stats ?? {})) player[stat as StatKey] += amount;
  for (const [stat, amount] of Object.entries(effect.tempStats ?? {})) {
    player.tempBoosts[stat as StatKey] = (player.tempBoosts[stat as StatKey] ?? 0) + amount;
  }
  player.credit += effect.credit ?? 0;
  player.spellbookTokens = Math.max(0, player.spellbookTokens + (effect.spellbookTokens ?? 0));
  player.pendingStaminaTokens += effect.nextStamina ?? 0;
}

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
    examResults: [],
    equipmentPile: createEquipmentPile(),
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
  // 선 플레이어: 매력이 가장 높은 플레이어 (동점이면 주사위), 이후 그 플레이어부터 시계방향
  const starterId = [...state.turnOrder].sort((a, b) => compareTieBreak(state, a, b))[0];
  state.startingPlayerIndex = state.turnOrder.indexOf(starterId);
  log(state, `선 플레이어: ${state.players[starterId].name}`);
  for (const playerId of state.turnOrder) {
    const player = state.players[playerId];
    // 1주차(준비): 체력 수치만큼 체력토큰, 주문력 수치만큼 마법 주문서 획득
    const prepAbilities = abilitiesOf(player, "prep");
    player.staminaTokens = Math.max(
      0,
      effectiveStat(player, "stamina") + player.pendingStaminaTokens + sumEffect(prepAbilities, "stamina"),
    );
    player.pendingStaminaTokens = 0;
    player.spellbookTokens = effectiveStat(player, "spellPower") + sumEffect(prepAbilities, "spellbook");
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
  log(state, "2주차(수업): 수업카드 배분");
}

function allPlayersActed(state: GameState): boolean {
  return state.turnOrder.every((id) => state.players[id].hasActedThisPhase);
}

export function submitClassChoice(state: GameState, playerId: string, keepCardIds: string[]): void {
  if (state.phase !== "class") throw new Error("지금은 수업 단계가 아닙니다.");
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
  state.activityOrder = rotateFrom(state.turnOrder, state.startingPlayerIndex);
  state.activityTurnPointer = 0;
  for (const playerId of state.turnOrder) {
    state.players[playerId].hasActedThisPhase = false;
  }
  log(state, "3주차(방과후활동) 시작");
}

function resolveActivity(
  state: GameState,
  activityId: ActivityId,
  player: PlayerGameState,
  targetPlayerId: string | undefined,
): void {
  switch (activityId) {
    case "tournament": {
      const gain = effectiveStat(player, "spellPower");
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
      if (player.spellbookTokens >= card.requiredSpellPower) {
        player.spellbookTokens -= card.requiredSpellPower;
        player.creatures.push(card);
        const gain = card.ability.trigger === "acquire" && card.ability.effect === "spellPower" ? card.ability.amount : 0;
        player.spellPower += gain;
        log(
          state,
          `${player.name}: 마법생물 "${card.name}" 획득 (${describeAbility(card.ability)})`,
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
      // 마법생물 능력: 참여 시(duel)는 양쪽, 도전받았을 때(defend)는 도전받은 쪽만 적용
      const challengerAbilities = abilitiesOf(player, "duel");
      const defenderAbilities = [...abilitiesOf(target, "duel"), ...abilitiesOf(target, "defend")];
      const challengerRoll = Math.max(
        0,
        rollD6() + effectiveStat(player, "spellPower") + sumEffect(challengerAbilities, "rollBonus") - sumEffect(defenderAbilities, "enemyRollPenalty"),
      );
      const defenderRoll = Math.max(
        0,
        rollD6() + effectiveStat(target, "spellPower") + sumEffect(defenderAbilities, "rollBonus") - sumEffect(challengerAbilities, "enemyRollPenalty"),
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
      if (loser.spellbookTokens > 0 && sumEffect(loserAbilities, "immune") === 0) {
        loser.spellbookTokens = Math.max(0, loser.spellbookTokens - BALANCE.duelLoserTokenLoss);
      }
      log(
        state,
        `${player.name}(${challengerRoll}) vs ${target.name}(${defenderRoll}): ${winner.name} 승리${grimoire ? `, 마도서 "${grimoire.name}" 획득` : ""}`,
      );
      break;
    }
    case "exploration": {
      // 협력 없이 단독 처리로 확정 (2026-09-29)
      const card = drawFromPile(state.explorationPile);
      if (!card) break;
      let success = true;
      let rollText = "";
      if (card.check) {
        const roll = rollD6();
        const total = roll + effectiveStat(player, card.check.stat);
        success = total >= card.check.target;
        rollText = ` (판정 ${total}/${card.check.target} ${success ? "성공" : "실패"})`;
      }
      const effect = success ? card.success : card.failure;
      applyCardEffect(player, effect);
      state.explorationPile.discard.push(card);
      log(state, `${player.name}: 비밀의 방 "${card.name}"${rollText} → ${describeEffect(effect)}`);
      break;
    }
    case "lab": {
      const card = drawFromPile(state.equipmentPile);
      if (!card) break;
      player.equipment.push(card);
      applyCardEffect(player, { tempStats: card.tempBoosts, credit: card.credit });
      const gained = describeEffect({ tempStats: card.tempBoosts, credit: card.credit });
      log(state, `${player.name}: 연구실 실험 → "${card.name}" (${gained})`);
      break;
    }
  }
}

export function selectActivity(
  state: GameState,
  playerId: string,
  activityId: ActivityId,
  targetPlayerId?: string,
): void {
  if (state.phase !== "activity") throw new Error("지금은 방과후활동 단계가 아닙니다.");
  const currentTurnPlayerId = state.activityOrder[state.activityTurnPointer];
  if (currentTurnPlayerId !== playerId) throw new Error("당신의 차례가 아닙니다.");
  if (!ACTIVITY_IDS.includes(activityId)) throw new Error("존재하지 않는 활동입니다.");
  if (state.activitySlots[activityId] !== null) throw new Error("이미 다른 플레이어가 선택한 구역입니다.");

  const player = state.players[playerId];
  resolveActivity(state, activityId, player, targetPlayerId);
  state.activitySlots[activityId] = playerId;
  player.hasActedThisPhase = true;
  state.activityTurnPointer += 1;

  if (state.activityTurnPointer >= state.activityOrder.length) {
    beginCleanupPhase(state);
  }
}

function beginCleanupPhase(state: GameState): void {
  state.phase = "cleanup";
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
    // 효과가 끝난 장비카드는 버림 더미로
    state.equipmentPile.discard.push(...p.equipment);
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
