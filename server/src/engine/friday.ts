import { activeSide, cards, effectiveSkill, instanceName } from './cards';
import { applyEffects, moveTrack, trainPlayer } from './effects';
import type { EffectContext, MatchContext } from './effects';
import { resolveMatch, sectorCounts } from './match';
import type { MatchReport, Slot, TeamSide } from './match';
import { matchDieResult } from './matchDie';
import type { Rng } from './rng';
import { GameError, addLog, emptyMods, getPlayer, nextInTurn, requireTurn } from './state';
import type { GameState, LineupSubmission, MatchAftermath, MatchMods, PlayerId, PlayerInstance, PlayerState } from './state';
import { hasTrait, lineupStaminaCost, traitCount, traitSum } from './traits';
import { RESOURCES, SECTORS } from './types';
import { runWeekend } from './weekend';
import type { Cost, Effect, MatchTiming, OpponentTeamCard, PlayerEffect, Resources, Sector } from './types';

const PRINTED_STANDS = 2; // p.6 1번/2번 관중석
const LEAGUE_MAX = 18;
const LEAGUE_WIN = 3;
const LEAGUE_DRAW = 1;
// placeholder: 상대 팀 주사위 눈 (p.2 그림: 0/1/3)
const OPPONENT_DIE = [0, 0, 1, 1, 3, 3] as const;

// 관중석 수 = 인쇄 2 + 3·4번 관중석 + 상시 효과(스폰서 '매 경기 팬덤 1개 추가 배치')
export function standsCount(player: Pick<PlayerState, 'infrastructure' | 'passives'>): number {
  return PRINTED_STANDS + player.infrastructure.filter((i) => i === 'stand3' || i === 'stand4').length + player.passives.filter((p) => p.passive === 'extraStand').length;
}

export function startFriday(state: GameState): void {
  for (const id of state.seats) getPlayer(state, id).tacticRedrawn = false;
  state.phase = {
    kind: 'friday.prepare',
    current: state.firstPlayer,
    submitted: Object.fromEntries(state.seats.map((id) => [id, null])),
    preMatch: Object.fromEntries(state.seats.map((id) => [id, emptyMods()])),
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

// 경기 전 맥락: 상대는 더미 맨 위 카드. 결과가 필요한 조건은 'defer' 된다
function preMatchContext(player: PlayerState, sub: LineupSubmission): MatchContext {
  const opponentCardId = player.opponentDeck[0];
  return { stage: 'pre', myGoals: 0, theirGoals: 0, sectorGoals: {}, placements: sub.placements, opponentTeamId: opponentCardId ? cards.opponent(opponentCardId).teamId : '' };
}

// p.20 경기 준비 제출. 전원 제출하면 경기 진행(상대 공개·전술 효과) 단계로
export function submitLineup(state: GameState, pid: PlayerId, sub: LineupSubmission, rng: Rng): GameState {
  const next = structuredClone(state);
  if (next.phase.kind !== 'friday.prepare') throw new GameError('not in match preparation');
  if (next.phase.submitted[pid] === undefined) throw new GameError(`unknown player: ${pid}`);
  if (next.phase.submitted[pid]) throw new GameError('already submitted');
  requireTurn(next.phase, pid);
  const player = getPlayer(next, pid);
  const { players } = validateLineup(player, sub);

  const cost: Partial<Resources> = { stamina: lineupStaminaCost(player, players), fandom: sub.fandomInStands ?? 0 };
  for (const placed of Object.values(sub.activations ?? {})) {
    for (const r of RESOURCES) cost[r] = (cost[r] ?? 0) + (placed[r] ?? 0);
  }
  pay(player, cost);
  // 미리 올려놓은 체력이 있는 출전 선수는 그중 1개를 출전 체력으로 쓴다. 남은 것은 카드에 그대로 (사용자 결정)
  for (const inst of players) if (inst.stamina > 0) inst.stamina--;
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
  // resolvePending 뒤 advanceFriday 가 다음 참가자로 넘긴다
  applyTimedEffects(next, pid, players, 'beforeMatch', { mods: next.phase.preMatch[pid]!, played: sub.players, match: preMatchContext(player, sub) }, rng);
  advanceFriday(next, pid, rng);
  return next;
}

// 금요일 턴제 진행: 경기 준비(라인업)와 경기 진행(전술 효과) 모두, 현재 참가자의 대상 선택이 끝나야 다음 참가자로.
// 전원 라인업 제출 → 경기 진행 단계, 전원 전술 효과 결정 → 경기 판정
export function advanceFriday(state: GameState, pid: PlayerId, rng: Rng): void {
  const phase = state.phase;
  if (phase.kind === 'friday.prepare') {
    if (phase.current !== pid || !phase.submitted[pid] || getPlayer(state, pid).pending.length > 0) return;
    const submitted = phase.submitted;
    const following = nextInTurn(state, (id) => submitted[id] !== null);
    if (following) phase.current = following;
    else startMatchPhase(state);
    return;
  }
  if (phase.kind === 'friday.match') {
    if (phase.current !== pid || !phase.decided[pid] || getPlayer(state, pid).pending.length > 0) return;
    const decided = phase.decided;
    const following = nextInTurn(state, (id) => !!decided[id]);
    if (following) phase.current = following;
    else resolveAllMatches(state, rng);
  }
}

// p.21 경기 진행: 상대 팀 카드를 공개하고(뷰가 현재 참가자의 카드를 앞면으로 보여준다) 전술 효과 카드 1장을 쓸 수 있다
function startMatchPhase(state: GameState): void {
  if (state.phase.kind !== 'friday.prepare') return;
  const submitted: Record<PlayerId, LineupSubmission> = {};
  for (const id of state.seats) submitted[id] = state.phase.submitted[id]!;
  state.phase = {
    kind: 'friday.match',
    current: state.firstPlayer,
    submitted,
    preMatch: state.phase.preMatch,
    effectCard: {},
    decided: Object.fromEntries(state.seats.map((id) => [id, false])),
  };
}

// p.21 8 / p.28: 포메이션에 쓴 카드가 아닌 전술 카드 1장의 효과를 적용한다(카드는 손에 남는다). null 이면 쓰지 않는다
export function playTacticEffect(state: GameState, pid: PlayerId, cardId: string | null, rng: Rng): GameState {
  const next = structuredClone(state);
  if (next.phase.kind !== 'friday.match') throw new GameError('not in match phase');
  requireTurn(next.phase, pid);
  if (next.phase.decided[pid]) throw new GameError('already decided');
  const player = getPlayer(next, pid);
  const sub = next.phase.submitted[pid]!;
  if (cardId !== null) {
    if (!player.tacticCards.includes(cardId)) throw new GameError('tactic card not in hand');
    if (cardId === sub.tacticCardId) throw new GameError('formation card cannot be used for its effect');
    const card = cards.tactic(cardId);
    if (!card.effect) throw new GameError('card has no effect');
    addLog(next, `전술 효과: ${card.name}`, { actor: pid });
    applyEffects(next, pid, card.effect.effects, card.name, { mods: next.phase.preMatch[pid]!, played: sub.players, match: preMatchContext(player, sub) }, rng);
  }
  next.phase.effectCard[pid] = cardId;
  next.phase.decided[pid] = true;
  advanceFriday(next, pid, rng);
  return next;
}

function activated(inst: PlayerInstance, effect: PlayerEffect): boolean {
  if (effect.mandatory) return true;
  return RESOURCES.every((r) => (effect.cost[r] ?? 0) <= (inst.placed[r] ?? 0));
}

// 출전 선수 카드의 시점별 효과. 득점·선방·득점 무효 같은 경기 효과는 ctx.mods 로 경기 판정에 반영된다
function applyTimedEffects(state: GameState, pid: PlayerId, played: PlayerInstance[], timing: MatchTiming, ctx: EffectContext, rng: Rng): void {
  for (const inst of played) {
    const effect = activeSide(inst).effect;
    if (!effect || effect.timing !== timing || !activated(inst, effect)) continue;
    applyEffects(state, pid, effect.effects, cards.player(inst.cardId).name, { ...ctx, inst }, rng);
    inst.exhausted = true;
  }
}

function buildSide(player: PlayerState, sub: LineupSubmission, played: PlayerInstance[], mods: MatchMods): TeamSide {
  const sectors: Record<Sector, Slot[]> = { LW: [], CB: [], CM: [], CF: [], RW: [] };
  const playedIds = new Set(played.map((p) => p.instanceId));
  for (const token of player.uniforms.filter((u) => u.location === 'field')) {
    const inst = token.cardInstanceId && playedIds.has(token.cardInstanceId) ? instanceOf(player, token.cardInstanceId) : null;
    const sector = sub.placements[token.id]!;
    sectors[sector].push({ id: token.id, role: token.face, skill: Math.max(0, (inst ? effectiveSkill(inst) : 1) + (mods.sectorSkill[sector] ?? 0)) });
  }
  const gk = played.find((p) => activeSide(p).goalkeeper);
  const base = gk ? { skill: effectiveSkill(gk), saves: activeSide(gk).goalkeeper!.saves } : { skill: 1, saves: 1 };
  return { sectors, goalkeeper: { ...base, saves: base.saves + mods.extraSaves + traitCount(player, 'extraSaves') } };
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
  if (state.phase.kind !== 'friday.match') return;
  const matches: Record<PlayerId, MatchAftermath> = {};
  const faced = new Map<string, number>();

  for (const pid of state.seats) {
    const player = getPlayer(state, pid);
    const sub = state.phase.submitted[pid]!;
    const mods = state.phase.preMatch[pid]!; // 경기 전 효과·전술 효과가 쌓아 둔 보정치
    const opponentCardId = player.opponentDeck.shift();
    if (!opponentCardId) throw new GameError('no opponent left');
    player.scouted = false; // 미리 본 카드는 이번 경기로 소진
    const opponent = cards.opponent(opponentCardId);
    const played = sub.players.map((id) => instanceOf(player, id));
    const pre: MatchContext = { stage: 'pre', myGoals: 0, theirGoals: 0, sectorGoals: {}, placements: sub.placements, opponentTeamId: opponent.teamId };

    applyTimedEffects(state, pid, played, 'duringMatch', { mods, played: sub.players, match: pre }, rng);
    const raw = resolveMatch(buildSide(player, sub, played, mods), opponentSide(opponent));
    mods.mine += raw.myGoals;
    mods.theirs += Math.max(0, raw.theirGoals - mods.denyGoals); // 득점 무효·슛 막기는 구획 비교 득점에만
    const sectorGoals: Partial<Record<Sector, number>> = {};
    for (const s of raw.sectors) sectorGoals[s.mine] = (sectorGoals[s.mine] ?? 0) + s.myGoals;
    const post = (): MatchContext => ({ stage: 'post', myGoals: mods.mine, theirGoals: mods.theirs, sectorGoals, placements: sub.placements, opponentTeamId: opponent.teamId });

    // 경기 전에 미뤄 둔 조건부 효과(전술 카드 등) → 경기 후 선수 효과
    const deferred = mods.deferred;
    mods.deferred = [];
    for (const d of deferred) {
      const inst = d.instanceId ? player.roster.find((r) => r.instanceId === d.instanceId) : undefined;
      applyEffects(state, pid, [d.effect], d.source, { mods, played: sub.players, match: post(), inst }, rng);
    }
    applyTimedEffects(state, pid, played, 'afterMatch', { mods, played: sub.players, match: post() }, rng);

    const report: MatchReport = {
      ...raw,
      myGoals: mods.mine,
      theirGoals: mods.theirs,
      outcome: mods.mine > mods.theirs ? 'win' : mods.mine < mods.theirs ? 'loss' : 'draw',
    };
    addLog(state, `경기 결과 ${report.myGoals}:${report.theirGoals} vs ${opponent.teamName} (${{ win: '승리', draw: '무승부', loss: '패배' }[report.outcome]})`, { actor: pid });

    moveLeague(state, pid, opponent.teamId, report.outcome);
    faced.set(opponent.teamId, (faced.get(opponent.teamId) ?? 0) + 1);

    // 상시 효과: 승리할 때마다 팬덤 +1 (스폰서 추가 보너스)
    const fandomOnWin = player.passives.filter((p) => p.passive === 'fandomOnWin').length;
    if (report.outcome === 'win' && fandomOnWin > 0) {
      player.resources.fandom += fandomOnWin;
      addLog(state, `승리 보너스: 팬덤 +${fandomOnWin}`, { actor: pid });
    }

    // p.24 4: 관중석 팬덤 → 돈, 출전 선수의 자원·일시적 토큰 제거
    player.resources.money += sub.fandomInStands ?? 0;
    if ((sub.fandomInStands ?? 0) > 0) player.resources.money += traitSum(player, 'standsBonusMoney'); // 특성: 관중 수입 +N
    const scorerTokens = new Set(report.scorers);
    for (const inst of played) {
      inst.placed = {}; // 미리 올려놓은 체력(inst.stamina)의 남은 분은 버리지 않는다 (사용자 결정)
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
  // 특성(팬덤 없이 재굴림)은 주당 1회 (사용자 결정, 2026-09). 그 뒤로는 팬덤을 낸다
  if (hasTrait(player, 'freeMatchReroll') && !player.freeRerollUsed.match) {
    player.freeRerollUsed.match = true;
    addLog(next, '특성: 팬덤 없이 경기 영향 주사위를 다시 굴림 (이번 주 무료 재굴림 사용)', { actor: pid });
  } else {
    if (player.resources.fandom < 1) throw new GameError('not enough fandom');
    player.resources.fandom--;
  }
  m.roll = rng.die(6);
  return next;
}

// 특성(전술 분석): 경기 준비 중 스카우트 보고서를 본 뒤 전술 카드 1장을 더미 맨 아래로 보내고 새로 1장 뽑는다 (경기일마다 1회)
export function redrawTactic(state: GameState, pid: PlayerId, cardId: string): GameState {
  const next = structuredClone(state);
  if (next.phase.kind !== 'friday.prepare') throw new GameError('not in match preparation');
  requireTurn(next.phase, pid);
  if (next.phase.submitted[pid]) throw new GameError('already submitted');
  const player = getPlayer(next, pid);
  if (!hasTrait(player, 'redrawTactic')) throw new GameError('no such trait');
  if (player.tacticRedrawn) throw new GameError('already redrawn this match day');
  const idx = player.tacticCards.indexOf(cardId);
  if (idx < 0) throw new GameError('tactic card not in hand');
  const fresh = next.decks.tactics.shift();
  if (!fresh) throw new GameError('tactic deck empty');
  player.tacticCards.splice(idx, 1, fresh);
  next.decks.tactics.push(cardId);
  player.tacticRedrawn = true;
  return next;
}

function chooseAmong(player: PlayerState, candidates: PlayerInstance[], effect: Effect, source: string, apply: (inst: PlayerInstance) => void): void {
  if (candidates.length === 1) apply(candidates[0]!);
  else if (candidates.length > 1) {
    player.pending.push({ id: `${source}#${player.pending.length}`, effect, source, target: 'player', candidates: candidates.map((c) => c.instanceId) });
  }
}

// p.24/p.27 부상: 12면체 → 유니폼 번호. 12는 12 이상 번호 선수 중 선택
function injure(state: GameState, player: PlayerState, played: PlayerInstance[], count: number, rng: Rng): void {
  const face = rng.die(12);
  const hit = played.filter((p) => {
    const n = activeSide(p).number;
    return n !== undefined && (face === 12 ? n >= 12 : n === face);
  });
  addLog(state, `부상 주사위 ${face}: ${hit.length ? hit.map((h) => instanceName(h)).join(', ') : '해당 없음'}`, { actor: player.id });
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
