// 게임 진행 규칙 출처: notes/기획_정리.md (2026-09-28 정리본)
// 문서에 명시되지 않아 임의로 정한 부분은 "ASSUMPTION" 주석으로 표시했습니다.
import {
  drawClassCard,
  drawCreatureCard,
  drawEquipmentCard,
  drawExplorationCard,
  drawGrimoireCard,
} from "./cards.js";
import {
  effectiveStat,
  type ActivityId,
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

function rotateFrom<T>(items: T[], startIndex: number): T[] {
  return [...items.slice(startIndex), ...items.slice(0, startIndex)];
}

function log(state: GameState, message: string): void {
  state.log.push({ round: state.round, message });
}

function createPlayer(id: string, name: string): PlayerGameState {
  return {
    id,
    name,
    intelligence: 1,
    stamina: 1,
    charm: 1,
    spellPower: 1,
    credit: 0,
    tempBoosts: {},
    staminaTokens: 0,
    spellbookTokens: 0,
    tournamentTrack: 0,
    classCards: [],
    creatures: [],
    equipment: [],
    grimoires: [],
    offeredClassCards: [],
    hasActedThisPhase: false,
  };
}

export function createGame(players: { id: string; name: string }[]): GameState {
  // ASSUMPTION: 선 플레이어는 무작위로 정하고(문서상 "무작위 또는 협의"), 좌석 순서(시계방향)는 참가 순서를 그대로 사용한다.
  const turnOrder = shuffle(players.map((p) => p.id));
  const state: GameState = {
    round: 1,
    phase: "prep",
    turnOrder,
    startingPlayerIndex: 0,
    players: Object.fromEntries(
      players.map((p) => [p.id, createPlayer(p.id, p.name)]),
    ),
    activitySlots: { tournament: null, creature: null, duel: null, exploration: null, lab: null },
    activityOrder: [],
    activityTurnPointer: 0,
    examResults: [],
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
    player.staminaTokens = effectiveStat(player, "stamina");
    player.spellbookTokens = effectiveStat(player, "spellPower");
  }
  beginClassPhase(state);
}

function beginClassPhase(state: GameState): void {
  state.phase = "class";
  for (const playerId of state.turnOrder) {
    const player = state.players[playerId];
    const drawCount = effectiveStat(player, "intelligence");
    player.offeredClassCards = Array.from({ length: drawCount }, () => drawClassCard());
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
      player.tournamentTrack = Math.min(10, player.tournamentTrack + gain);
      log(state, `${player.name}: 마법 토너먼트 참가 (트랙 ${player.tournamentTrack}칸)`);
      break;
    }
    case "creature": {
      const card = drawCreatureCard();
      if (player.spellbookTokens >= card.requiredSpellPower) {
        player.spellbookTokens -= card.requiredSpellPower;
        player.creatures.push(card);
        log(state, `${player.name}: 마법생물 "${card.name}" 획득`);
      } else {
        log(state, `${player.name}: 마법 주문서가 부족해 마법생물을 놓쳤습니다`);
      }
      break;
    }
    case "duel": {
      if (!targetPlayerId || !state.players[targetPlayerId] || targetPlayerId === player.id) {
        throw new Error("주문 대결 상대를 지정해야 합니다.");
      }
      const target = state.players[targetPlayerId];
      const challengerRoll = rollD6() + effectiveStat(player, "spellPower");
      const defenderRoll = rollD6() + effectiveStat(target, "spellPower");
      // 동점이면 도전받은 쪽(defender)이 승리
      const winner = challengerRoll > defenderRoll ? player : target;
      const loser = winner === player ? target : player;
      const grimoire = drawGrimoireCard();
      winner.grimoires.push(grimoire);
      winner[grimoire.statBoost.stat] += grimoire.statBoost.amount;
      if (loser.spellbookTokens > 0) loser.spellbookTokens -= 1;
      log(
        state,
        `${player.name}(${challengerRoll}) vs ${target.name}(${defenderRoll}): ${winner.name} 승리, 마도서 "${grimoire.name}" 획득`,
      );
      break;
    }
    case "exploration": {
      // ASSUMPTION: "협력" 처리는 탐험 카드 내용이 구체화되면 확정 (notes/기획_정리.md 5-4, 8절). 현재는 단독 처리 임시 버전.
      const card = drawExplorationCard();
      player.staminaTokens += card.rewardStaminaTokens;
      log(state, `${player.name}: 비밀의 방 탐색 → 체력토큰 ${card.rewardStaminaTokens}개 획득`);
      break;
    }
    case "lab": {
      const card = drawEquipmentCard();
      player.equipment.push(card);
      const { stat, amount } = card.tempBoost;
      player.tempBoosts[stat] = (player.tempBoosts[stat] ?? 0) + amount;
      log(state, `${player.name}: 연구실 실험 → "${card.name}" (${stat} 임시 +${amount})`);
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

  if (state.round === 6) {
    resolveExam(state, "midterm_exam");
  } else if (state.round === 12) {
    resolveExam(state, "final_exam");
  } else {
    advanceRound(state);
  }
}

function advanceRound(state: GameState): void {
  state.round += 1;
  // ASSUMPTION: 문서에 명시되지 않아, 매 라운드 선 플레이어를 한 명씩 시계방향으로 돌리는 방식으로 정함
  state.startingPlayerIndex = (state.startingPlayerIndex + 1) % state.turnOrder.length;
  beginRound(state);
}

function resolveExam(state: GameState, examType: "midterm_exam" | "final_exam"): void {
  state.phase = examType;

  let candidates = state.turnOrder.map((id) => ({
    playerId: id,
    score: rollDicePool(effectiveStat(state.players[id], "intelligence")),
  }));

  // 동점 처리: 주문력이 높은 쪽 우선, 그래도 동점이면 재굴림 (최대 10회 시도 후 순서 고정)
  for (let attempt = 0; attempt < 10; attempt++) {
    const scoreGroups = new Map<number, string[]>();
    for (const c of candidates) {
      scoreGroups.set(c.score, [...(scoreGroups.get(c.score) ?? []), c.playerId]);
    }
    const stillTiedIds = [...scoreGroups.values()]
      .filter((ids) => ids.length > 1)
      .flatMap((ids) => {
        const spellPowers = new Set(ids.map((id) => effectiveStat(state.players[id], "spellPower")));
        return spellPowers.size > 1 ? [] : ids; // 주문력으로 갈리면 재굴림 불필요
      });
    if (stillTiedIds.length === 0) break;
    candidates = candidates.map((c) =>
      stillTiedIds.includes(c.playerId)
        ? { ...c, score: rollDicePool(effectiveStat(state.players[c.playerId], "intelligence")) }
        : c,
    );
  }

  const ranked = candidates
    .map((c) => ({ ...c, spellPower: effectiveStat(state.players[c.playerId], "spellPower") }))
    .sort((a, b) => b.score - a.score || b.spellPower - a.spellPower);

  const result: ExamResult = { round: state.round, scores: [] };
  ranked.forEach((entry, index) => {
    const rank = index + 1;
    const creditAwarded = rank === 1 ? 3 : rank === 2 ? 2 : 1;
    state.players[entry.playerId].credit += creditAwarded;
    result.scores.push({ playerId: entry.playerId, score: entry.score, rank, creditAwarded });
  });
  state.examResults.push(result);
  log(state, `${examType === "midterm_exam" ? "중간고사" : "기말고사"} 결과 반영 (학점 지급 완료)`);

  // 연구실 실험으로 얻은 임시 능력치 증가분은 다음 시험까지 유지된 뒤 소멸
  for (const playerId of state.turnOrder) {
    state.players[playerId].tempBoosts = {};
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
  const tracks = [...new Set(state.turnOrder.map((id) => state.players[id].tournamentTrack))].sort(
    (a, b) => b - a,
  );
  const [firstTrack, secondTrack] = tracks;
  for (const playerId of state.turnOrder) {
    const player = state.players[playerId];
    if (firstTrack !== undefined && player.tournamentTrack === firstTrack && firstTrack > 0) {
      player.credit += 2;
      log(state, `${player.name}: 마법 토너먼트 1위 보상 학점 +2`);
    } else if (secondTrack !== undefined && player.tournamentTrack === secondTrack && secondTrack > 0) {
      player.credit += 1;
      log(state, `${player.name}: 마법 토너먼트 2위 보상 학점 +1`);
    }
  }
}

function finalizeGame(state: GameState): void {
  state.phase = "ended";
  const achievements = state.turnOrder.map((id) => ({
    playerId: id,
    achievement: effectiveStat(state.players[id], "spellPower") * state.players[id].credit,
  }));
  const maxAchievement = Math.max(...achievements.map((a) => a.achievement));
  state.winnerIds = achievements.filter((a) => a.achievement === maxAchievement).map((a) => a.playerId);
  log(state, "게임 종료: 마법 성취도(주문력 × 학점) 최고 플레이어 승리");
}
