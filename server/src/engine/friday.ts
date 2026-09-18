import { activeSide, cards, effectiveSkill } from './cards';
import { applyEffects, moveTrack, trainPlayer } from './effects';
import { resolveMatch, sectorCounts } from './match';
import type { MatchReport, Slot, TeamSide } from './match';
import { matchDieResult } from './matchDie';
import type { Rng } from './rng';
import { GameError, addLog, getPlayer, nextInTurn, requireTurn } from './state';
import type { GameState, LineupSubmission, MatchAftermath, PlayerId, PlayerInstance, PlayerState } from './state';
import { RESOURCES, SECTORS } from './types';
import { runWeekend } from './weekend';
import type { Cost, Effect, MatchTiming, OpponentTeamCard, PlayerEffect, Resources, Sector } from './types';

const PRINTED_STANDS = 2; // p.6 1번/2번 관중석
const LEAGUE_MAX = 18;
const LEAGUE_WIN = 3;
const LEAGUE_DRAW = 1;
// placeholder: 상대 팀 주사위 눈 (p.2 그림: 0/1/3)
const OPPONENT_DIE = [0, 0, 1, 1, 3, 3] as const;

export function standsCount(player: Pick<PlayerState, 'infrastructure'>): number {
  return PRINTED_STANDS + player.infrastructure.filter((i) => i === 'stand3' || i === 'stand4').length;
}

export function startFriday(state: GameState): void {
  state.phase = {
    kind: 'friday.prepare',
    current: state.firstPlayer,
    submitted: Object.fromEntries(state.seats.map((id) => [id, null])),
    preGoals: Object.fromEntries(state.seats.map((id) => [id, { mine: 0, theirs: 0 }])),
  };
}

function instanceOf(player: PlayerState, instanceId: string): PlayerInstance {
  const inst = player.roster.find((p) => p.instanceId === instanceId);
  if (!inst) throw new GameError(`no such player: ${instanceId}`);
  return inst;
}

// 벤치에 있는 출전 선수 토큰을 카드 없는 필드 토큰(가장 큰 번호)과 교환 (p.20 3)
export function swapBenchTokens(player: Pick<PlayerState, 'uniforms'>, played: string[]): void {
  for (const instanceId of played) {
    const token = player.uniforms.find((u) => u.cardInstanceId === instanceId);
    if (!token || token.location === 'field') continue;
    const swapOut = player.uniforms
      .filter((u) => u.location === 'field' && (!u.cardInstanceId || !played.includes(u.cardInstanceId)))
      .sort((a, b) => (b.number ?? -1) - (a.number ?? -1))[0];
    if (!swapOut) throw new GameError('no field token to swap with');
    swapOut.location = 'bench';
    token.location = 'field';
  }
}

function pay(player: PlayerState, cost: Cost): void {
  for (const r of RESOURCES) if ((cost[r] ?? 0) > player.resources[r]) throw new GameError(`not enough ${r}`);
  for (const r of RESOURCES) player.resources[r] -= cost[r] ?? 0;
}

function validateLineup(player: PlayerState, sub: LineupSubmission): { players: PlayerInstance[] } {
  if (!player.tacticCards.includes(sub.tacticCardId)) throw new GameError('tactic card not in hand');
  const formation = cards.tactic(sub.tacticCardId).formations[sub.formationIndex];
  if (!formation) throw new GameError('invalid formation index');

  const players = sub.players.map((id) => instanceOf(player, id));
  if (new Set(sub.players).size !== players.length) throw new GameError('duplicate player');
  const numbers = new Set<number>();
  for (const inst of players) {
    if (inst.tokens.injury > 0 || inst.tokens.suspension > 0) throw new GameError('injured or suspended player cannot play');
    const n = activeSide(inst).number;
    if (n !== undefined) {
      if (numbers.has(n)) throw new GameError(`duplicate uniform number ${n}`);
      numbers.add(n);
    }
  }

  swapBenchTokens(player, sub.players);
  const field = player.uniforms.filter((u) => u.location === 'field');
  const placedIds = Object.keys(sub.placements);
  if (placedIds.length !== field.length || field.some((u) => !(u.id in sub.placements))) {
    throw new GameError('placements must cover exactly the field tokens');
  }
  const counts: Record<Sector, number> = { LW: 0, CB: 0, CM: 0, CF: 0, RW: 0 };
  for (const token of field) {
    const sector = sub.placements[token.id]!;
    if (!SECTORS.includes(sector)) throw new GameError(`invalid sector ${sector}`);
    counts[sector]++;
    if (token.cardInstanceId && sub.players.includes(token.cardInstanceId)) {
      const zones = activeSide(instanceOf(player, token.cardInstanceId)).zones;
      if (!zones.includes(sector)) throw new GameError(`${token.cardInstanceId} cannot play in ${sector}`);
    }
  }
  const required = sectorCounts(formation);
  for (const s of SECTORS) if (counts[s] !== required[s]) throw new GameError(`formation requires ${required[s]} in ${s}, got ${counts[s]}`);

  const stands = sub.fandomInStands ?? 0;
  if (stands < 0 || stands > standsCount(player)) throw new GameError('too many fandom in stands');
  return { players };
}

// p.20 경기 준비 제출. 전원 제출하면 경기를 일괄 처리한다
export function submitLineup(state: GameState, pid: PlayerId, sub: LineupSubmission, rng: Rng): GameState {
  const next = structuredClone(state);
  if (next.phase.kind !== 'friday.prepare') throw new GameError('not in match preparation');
  if (next.phase.submitted[pid] === undefined) throw new GameError(`unknown player: ${pid}`);
  if (next.phase.submitted[pid]) throw new GameError('already submitted');
  requireTurn(next.phase, pid);
  const player = getPlayer(next, pid);
  const { players } = validateLineup(player, sub);

  const cost: Partial<Resources> = { stamina: players.length, fandom: sub.fandomInStands ?? 0 };
  for (const placed of Object.values(sub.activations ?? {})) {
    for (const r of RESOURCES) cost[r] = (cost[r] ?? 0) + (placed[r] ?? 0);
  }
  pay(player, cost);
  for (const [instanceId, placed] of Object.entries(sub.activations ?? {})) {
    const inst = instanceOf(player, instanceId);
    for (const r of RESOURCES) if (placed[r]) inst.placed[r] = (inst.placed[r] ?? 0) + placed[r];
  }

  // p.20 4: 부상/출장정지 카드마다 1개씩 제거
  for (const inst of player.roster) {
    if (inst.tokens.injury > 0) inst.tokens.injury--;
    if (inst.tokens.suspension > 0) inst.tokens.suspension--;
  }
  for (const s of player.staff) if (s.suspension > 0) s.suspension--;

  next.phase.submitted[pid] = sub;
  // 경기 전 효과는 여기서 바로 적용한다. 판정과 같은 액션 안에서 처리하면 대상 선택(pending)이 경기 뒤로 밀려
  // 일시 역량 토큰 등이 경기에 반영되지 않는다. 대상 선택이 남으면 이 참가자 차례에 머물고,
  // resolvePending 뒤 advanceAfterLineup 이 다음 참가자로 넘긴다
  applyTimedEffects(next, pid, players, 'beforeMatch', next.phase.preGoals[pid]!);
  advanceAfterLineup(next, pid, rng);
  return next;
}

// 라인업을 제출한 참가자의 경기 전 효과 대상 선택이 모두 끝났으면 다음 참가자로, 전원 제출이면 경기 판정
export function advanceAfterLineup(state: GameState, pid: PlayerId, rng: Rng): void {
  if (state.phase.kind !== 'friday.prepare' || state.phase.current !== pid) return;
  if (!state.phase.submitted[pid] || getPlayer(state, pid).pending.length > 0) return;
  const submitted = state.phase.submitted;
  const following = nextInTurn(state, (id) => submitted[id] !== null);
  if (following) state.phase.current = following;
  else resolveAllMatches(state, rng);
}

function activated(inst: PlayerInstance, effect: PlayerEffect): boolean {
  if (effect.mandatory) return true;
  return RESOURCES.every((r) => (effect.cost[r] ?? 0) <= (inst.placed[r] ?? 0));
}

// 출전 선수 카드의 시점별 효과. 득점 효과는 경기 점수에 직접 반영
function applyTimedEffects(state: GameState, pid: PlayerId, played: PlayerInstance[], timing: MatchTiming, goals: { mine: number; theirs: number }): void {
  for (const inst of played) {
    const effect = activeSide(inst).effect;
    if (!effect || effect.timing !== timing || !activated(inst, effect)) continue;
    const others: Effect[] = [];
    for (const e of effect.effects) {
      if (e.type === 'scoreGoal') {
        if (e.team === 'self') goals.mine = Math.max(0, goals.mine + e.amount);
        else goals.theirs = Math.max(0, goals.theirs + e.amount);
      } else {
        others.push(e);
      }
    }
    if (others.length) applyEffects(state, pid, others, cards.player(inst.cardId).name);
    inst.exhausted = true;
  }
}

function buildSide(player: PlayerState, sub: LineupSubmission, played: PlayerInstance[]): TeamSide {
  const sectors: Record<Sector, Slot[]> = { LW: [], CB: [], CM: [], CF: [], RW: [] };
  const playedIds = new Set(played.map((p) => p.instanceId));
  for (const token of player.uniforms.filter((u) => u.location === 'field')) {
    const inst = token.cardInstanceId && playedIds.has(token.cardInstanceId) ? instanceOf(player, token.cardInstanceId) : null;
    sectors[sub.placements[token.id]!].push({ id: token.id, role: token.face, skill: inst ? effectiveSkill(inst) : 1 });
  }
  const gk = played.find((p) => activeSide(p).goalkeeper);
  return {
    sectors,
    goalkeeper: gk ? { skill: effectiveSkill(gk), saves: activeSide(gk).goalkeeper!.saves } : { skill: 1, saves: 1 },
  };
}

// 상대 카드는 상하 반전(p.20)이지만 SECTOR_PAIRS 가 내 LW↔상대 RW 로 짝짓기 때문에 카드 구획을 그대로 쓴다
function opponentSide(card: OpponentTeamCard): TeamSide {
  const sectors: Record<Sector, Slot[]> = { LW: [], CB: [], CM: [], CF: [], RW: [] };
  for (const s of SECTORS) sectors[s] = card.sectors[s].map((slot, i) => ({ id: `${card.id}:${s}${i}`, ...slot }));
  return { sectors, goalkeeper: card.goalkeeper };
}

function moveLeague(state: GameState, pid: PlayerId, teamId: string, outcome: MatchReport['outcome']): void {
  const mine = outcome === 'win' ? LEAGUE_WIN : outcome === 'draw' ? LEAGUE_DRAW : 0;
  const theirs = outcome === 'loss' ? LEAGUE_WIN : outcome === 'draw' ? LEAGUE_DRAW : 0;
  state.league.players[pid] = Math.min(LEAGUE_MAX, state.league.players[pid]! + mine);
  const opp = state.league.opponents.find((o) => o.teamId === teamId);
  if (opp) opp.position = Math.min(LEAGUE_MAX, opp.position + theirs);
}

function resolveAllMatches(state: GameState, rng: Rng): void {
  if (state.phase.kind !== 'friday.prepare') return;
  const matches: Record<PlayerId, MatchAftermath> = {};
  const faced = new Map<string, number>();

  for (const pid of state.seats) {
    const player = getPlayer(state, pid);
    const sub = state.phase.submitted[pid]!;
    const opponentCardId = player.opponentDeck.shift();
    if (!opponentCardId) throw new GameError('no opponent left');
    player.scouted = false; // 미리 본 카드는 이번 경기로 소진
    const opponent = cards.opponent(opponentCardId);
    const played = sub.players.map((id) => instanceOf(player, id));
    const goals = { ...state.phase.preGoals[pid]! }; // 경기 전 효과는 제출 시점에 이미 적용됨

    applyTimedEffects(state, pid, played, 'duringMatch', goals);
    const raw = resolveMatch(buildSide(player, sub, played), opponentSide(opponent));
    goals.mine += raw.myGoals;
    goals.theirs += raw.theirGoals;
    applyTimedEffects(state, pid, played, 'afterMatch', goals);

    const report: MatchReport = {
      ...raw,
      myGoals: goals.mine,
      theirGoals: goals.theirs,
      outcome: goals.mine > goals.theirs ? 'win' : goals.mine < goals.theirs ? 'loss' : 'draw',
    };
    addLog(state, `경기 결과 ${report.myGoals}:${report.theirGoals} vs ${opponent.teamName} (${{ win: '승리', draw: '무승부', loss: '패배' }[report.outcome]})`, { actor: pid });

    moveLeague(state, pid, opponent.teamId, report.outcome);
    faced.set(opponent.teamId, (faced.get(opponent.teamId) ?? 0) + 1);

    // p.24 4: 관중석 팬덤 → 돈, 출전 선수의 자원·일시적 토큰 제거
    player.resources.money += sub.fandomInStands ?? 0;
    const scorerTokens = new Set(report.scorers);
    for (const inst of played) {
      inst.placed = {};
      inst.tokens.strengthTemp = 0;
      inst.tokens.weaknessTemp = 0;
      const career = activeSide(inst).career;
      if (career) {
        if (inst.careerUsed.appearances < career.appearances) {
          inst.careerUsed.appearances++;
          inst.careerVP++;
        }
        const token = player.uniforms.find((u) => u.cardInstanceId === inst.instanceId);
        if (token && scorerTokens.has(token.id) && inst.careerUsed.goals < career.goals) {
          inst.careerUsed.goals++;
          inst.careerVP++;
        }
      }
    }
    matches[pid] = { opponentCardId, played: sub.players, report, roll: null, decided: false };
  }

  // p.24 3: 같은 상대와 2명 이상 경기 → 비활성. p.24 6: 아무도 상대하지 않은 팀은 상대 팀 주사위
  for (const opp of state.league.opponents) {
    const n = faced.get(opp.teamId) ?? 0;
    if (n >= 2) opp.active = false;
    else if (n === 0) {
      if (!opp.active) opp.active = true;
      else opp.position = Math.min(LEAGUE_MAX, opp.position + OPPONENT_DIE[rng.int(6)]!);
    }
  }
  state.phase = { kind: 'friday.aftermath', current: state.firstPlayer, matches };
}

function aftermathOf(state: GameState, pid: PlayerId): MatchAftermath {
  if (state.phase.kind !== 'friday.aftermath') throw new GameError('not in match aftermath');
  const m = state.phase.matches[pid];
  if (!m) throw new GameError(`unknown player: ${pid}`);
  if (m.decided) throw new GameError('already decided');
  requireTurn(state.phase, pid);
  return m;
}

// p.24 5: 경기 영향 주사위
export function rollMatchDie(state: GameState, pid: PlayerId, rng: Rng): GameState {
  const next = structuredClone(state);
  const m = aftermathOf(next, pid);
  if (m.roll !== null) throw new GameError('already rolled; use reroll');
  m.roll = rng.die(6);
  return next;
}

export function rerollMatchDie(state: GameState, pid: PlayerId, rng: Rng): GameState {
  const next = structuredClone(state);
  const m = aftermathOf(next, pid);
  if (m.roll === null) throw new GameError('roll first');
  const player = getPlayer(next, pid);
  if (player.resources.fandom < 1) throw new GameError('not enough fandom');
  player.resources.fandom--;
  m.roll = rng.die(6);
  return next;
}

function chooseAmong(player: PlayerState, candidates: PlayerInstance[], effect: Effect, source: string, apply: (inst: PlayerInstance) => void): void {
  if (candidates.length === 1) apply(candidates[0]!);
  else if (candidates.length > 1) {
    player.pending.push({ id: `${source}#${player.pending.length}`, effect, source, candidates: candidates.map((c) => c.instanceId) });
  }
}

// p.24/p.27 부상: 12면체 → 유니폼 번호. 12는 12 이상 번호 선수 중 선택
function injure(state: GameState, player: PlayerState, played: PlayerInstance[], count: number, rng: Rng): void {
  const face = rng.die(12);
  const hit = played.filter((p) => {
    const n = activeSide(p).number;
    return n !== undefined && (face === 12 ? n >= 12 : n === face);
  });
  addLog(state, `부상 주사위 ${face}: ${hit.length ? hit.map((h) => cards.player(h.cardId).name).join(', ') : '해당 없음'}`, { actor: player.id });
  chooseAmong(player, hit, { type: 'addPlayerToken', token: 'injury', count }, '부상', (inst) => (inst.tokens.injury += count));
}

export function acceptMatchRoll(state: GameState, pid: PlayerId, rng: Rng): GameState {
  const next = structuredClone(state);
  const m = aftermathOf(next, pid);
  if (m.roll === null) throw new GameError('roll first');
  const player = getPlayer(next, pid);
  const played = m.played.map((id) => instanceOf(player, id));

  // 결과는 경기 승/무/패에 따라 다르다 (경기 보드 표)
  switch (matchDieResult(m.report.outcome, m.roll)) {
    case 'fandomUp':
      moveTrack(player, 'fandom', 1);
      break;
    case 'train':
      chooseAmong(player, played.filter((p) => !p.trained), { type: 'trainPlayer', count: 1 }, '경기 영향:훈련', (inst) => trainPlayer(player, inst));
      break;
    case 'strength':
      chooseAmong(player, played, { type: 'addPlayerToken', token: 'strengthTemp', count: 1 }, '경기 영향:역량', (inst) => inst.tokens.strengthTemp++);
      break;
    case 'weakness':
      chooseAmong(player, played, { type: 'addPlayerToken', token: 'weaknessTemp', count: 1 }, '경기 영향:약점', (inst) => inst.tokens.weaknessTemp++);
      break;
    case 'injury':
      injure(next, player, played, 1, rng);
      break;
    case 'severeInjury':
      injure(next, player, played, 2, rng);
      break;
    case 'doubleInjury':
      injure(next, player, played, 1, rng);
      injure(next, player, played, 1, rng);
      break;
    case 'doubleSevereInjury':
      injure(next, player, played, 2, rng);
      injure(next, player, played, 2, rng);
      break;
  }
  m.decided = true;
  if (next.phase.kind === 'friday.aftermath') {
    const matches = next.phase.matches;
    const following = nextInTurn(next, (id) => matches[id]!.decided);
    if (following) next.phase.current = following;
    else runWeekend(next, rng);
  }
  return next;
}
